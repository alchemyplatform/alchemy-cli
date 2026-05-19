import { Command } from "commander";
import { address as solAddress } from "@solana/kit";
import {
  clientFromFlags,
  resolveActiveSigner,
  resolveAuthToken,
  resolveSolanaNetwork,
  resolveSolanaWalletKey,
  resolveWalletSession,
} from "../lib/resolve.js";
import { errInvalidArgs, errSolanaWalletKeyRequired, exitWithError } from "../lib/errors.js";
import { addSignerOption, parseOptionalInt, parseSignerOpt } from "../lib/params.js";
import { validateSolanaAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { green, printKeyValue, successBadge, withSpinner } from "../lib/ui.js";
import { formatTokenAmount, parseAmount } from "../lib/token-amounts.js";
import {
  buildAndSendSolanaTransaction,
  buildAndSendSolanaTransactionWithSession,
  buildSplTokenApproveCheckedInstruction,
  buildSplTokenRevokeInstruction,
  createSolanaSignerFromKeyBytes,
  parseSolanaKeyBytes,
  waitForSolanaConfirmation,
} from "../lib/solana-tx.js";
import { resolveSolanaFeeSponsorship } from "../lib/solana-fees.js";
import { getWalletSessionByChain } from "../lib/wallet-session.js";

interface DelegateApproveOpts {
  tokenAccount: string;
  mint: string;
  delegate: string;
  amount: string;
  decimals: string;
  feeSponsored?: boolean;
  feePolicyId?: string;
  signer?: string;
}

interface DelegateRevokeOpts {
  tokenAccount: string;
  feeSponsored?: boolean;
  feePolicyId?: string;
  signer?: string;
}

interface SolanaDelegateSigner {
  type: "local";
  keyBytes: Uint8Array;
  signer: Awaited<ReturnType<typeof createSolanaSignerFromKeyBytes>>;
}

interface SolanaDelegateSessionSigner {
  type: "session";
  address: string;
  session: NonNullable<ReturnType<typeof resolveWalletSession>>;
  authToken: string;
}

function parseDecimals(value: string): number {
  const decimals = parseOptionalInt(value, "--decimals");
  if (decimals === undefined || decimals > 255) {
    throw errInvalidArgs("--decimals must be an integer between 0 and 255.");
  }
  return decimals;
}

async function resolveSolanaDelegateSigner(
  program: Command,
  signerOpt: string | undefined,
): Promise<SolanaDelegateSigner | SolanaDelegateSessionSigner> {
  const signer = parseSignerOpt(signerOpt);
  if (signer === "session") {
    return resolveSessionSolanaDelegateSigner();
  }
  if (signer === undefined && resolveActiveSigner(program) === "session") {
    return resolveSessionSolanaDelegateSigner();
  }

  const solanaKey = resolveSolanaWalletKey(program);
  if (!solanaKey) {
    if (signer === undefined) {
      const sessionSigner = tryResolveSessionSolanaDelegateSigner();
      if (sessionSigner) {
        return sessionSigner;
      }
    }
    throw errSolanaWalletKeyRequired();
  }

  const keyBytes = parseSolanaKeyBytes(solanaKey);
  return {
    type: "local",
    keyBytes,
    signer: await createSolanaSignerFromKeyBytes(keyBytes),
  };
}

function resolveSessionSolanaDelegateSigner(): SolanaDelegateSessionSigner {
  const sessionSigner = tryResolveSessionSolanaDelegateSigner();
  if (!sessionSigner) {
    throw errInvalidArgs(
      "No active Solana wallet session. Run `alchemy wallet connect --mode session` first.",
    );
  }
  return sessionSigner;
}

function tryResolveSessionSolanaDelegateSigner(): SolanaDelegateSessionSigner | undefined {
  const authToken = resolveAuthToken();
  const session = resolveWalletSession();
  const solanaSession = session
    ? getWalletSessionByChain(session, "solana")
    : null;
  if (!authToken || !solanaSession?.solanaAddress) {
    return undefined;
  }
  return {
    type: "session",
    address: solanaSession.solanaAddress,
    session: solanaSession,
    authToken,
  };
}

export function registerSolanaDelegate(program: Command) {
  const cmd = program
    .command("delegate")
    .description("Delegate Solana token authority");

  const approveCmd = cmd
    .command("approve")
    .description("Approve a delegate for an SPL token account")
    .requiredOption("--token-account <address>", "SPL token account to delegate from")
    .requiredOption("--mint <address>", "SPL token mint")
    .requiredOption("--delegate <address>", "Delegate address")
    .requiredOption("--amount <number>", "Amount to delegate in decimal token units")
    .requiredOption("--decimals <n>", "Mint decimals")
    .option("--fee-sponsored", "Enable Solana fee sponsorship")
    .option("--fee-policy-id <id>", "Solana fee policy ID for sponsorship");
  addSignerOption(approveCmd);
  approveCmd.action(async (_opts: unknown, actionCommand: Command) => {
    try {
      await performSolanaDelegateApprove(
        actionCommand,
        actionCommand.opts<DelegateApproveOpts>(),
      );
    } catch (err) {
      exitWithError(err);
    }
  });

  const revokeCmd = cmd
    .command("revoke")
    .description("Revoke an SPL token delegate")
    .requiredOption("--token-account <address>", "SPL token account to revoke delegation from")
    .option("--fee-sponsored", "Enable Solana fee sponsorship")
    .option("--fee-policy-id <id>", "Solana fee policy ID for sponsorship");
  addSignerOption(revokeCmd);
  revokeCmd.action(async (_opts: unknown, actionCommand: Command) => {
    try {
      await performSolanaDelegateRevoke(
        actionCommand,
        actionCommand.opts<DelegateRevokeOpts>(),
      );
    } catch (err) {
      exitWithError(err);
    }
  });
}

export async function performSolanaDelegateApprove(
  program: Command,
  opts: DelegateApproveOpts,
): Promise<void> {
  validateSolanaAddress(opts.tokenAccount);
  validateSolanaAddress(opts.mint);
  validateSolanaAddress(opts.delegate);

  const decimals = parseDecimals(opts.decimals);
  const rawAmount = parseAmount(opts.amount, decimals);
  const signer = await resolveSolanaDelegateSigner(program, opts.signer);
  const network = resolveSolanaNetwork(program);
  const { sponsored, feePolicyId } = await resolveSolanaFeeSponsorship(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  const instruction = buildSplTokenApproveCheckedInstruction({
    tokenAccount: solAddress(opts.tokenAccount),
    mint: solAddress(opts.mint),
    delegate: solAddress(opts.delegate),
    owner: { address: solAddress(signer.type === "session" ? signer.address : signer.signer.address) },
    amount: rawAmount,
    decimals,
  });

  const result = await withSpinner(
    "Approving delegate...",
    "Delegate approved",
    async () => {
      if (signer.type === "session") {
        return await buildAndSendSolanaTransactionWithSession({
          client,
          instructions: [instruction],
          session: signer.session,
          authToken: signer.authToken,
          sponsored,
          gasPolicyId: feePolicyId,
        });
      }
      return await buildAndSendSolanaTransaction({
        client,
        instructions: [instruction],
        senderKeyBytes: signer.keyBytes,
        sponsored,
        gasPolicyId: feePolicyId,
      });
    },
  );

  const confirmed = await withSpinner(
    "Waiting for confirmation...",
    "Confirmation status received",
    () => waitForSolanaConfirmation(client, result.signature),
  );

  if (isJSONMode()) {
    printJSON({
      action: "approve",
      owner: result.fromAddress,
      tokenAccount: opts.tokenAccount,
      mint: opts.mint,
      delegate: opts.delegate,
      amount: opts.amount,
      rawAmount: rawAmount.toString(),
      decimals,
      network,
      sponsored,
      signature: result.signature,
      status: confirmed ? "confirmed" : "pending",
    });
    return;
  }

  const pairs: [string, string][] = [
    ["Owner", result.fromAddress],
    ["Token Account", opts.tokenAccount],
    ["Mint", opts.mint],
    ["Delegate", opts.delegate],
    ["Amount", green(formatTokenAmount(rawAmount, decimals))],
    ["Network", network],
  ];

  if (sponsored) {
    pairs.push(["Fee", green("Sponsored")]);
  }

  pairs.push(["Signature", result.signature]);
  pairs.push(["Status", confirmed ? `${successBadge()} ${green("Confirmed")}` : "Pending"]);
  printKeyValue(pairs);
}

export async function performSolanaDelegateRevoke(
  program: Command,
  opts: DelegateRevokeOpts,
): Promise<void> {
  validateSolanaAddress(opts.tokenAccount);

  const signer = await resolveSolanaDelegateSigner(program, opts.signer);
  const network = resolveSolanaNetwork(program);
  const { sponsored, feePolicyId } = await resolveSolanaFeeSponsorship(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  const instruction = buildSplTokenRevokeInstruction({
    tokenAccount: solAddress(opts.tokenAccount),
    owner: { address: solAddress(signer.type === "session" ? signer.address : signer.signer.address) },
  });

  const result = await withSpinner(
    "Revoking delegate...",
    "Delegate revoked",
    async () => {
      if (signer.type === "session") {
        return await buildAndSendSolanaTransactionWithSession({
          client,
          instructions: [instruction],
          session: signer.session,
          authToken: signer.authToken,
          sponsored,
          gasPolicyId: feePolicyId,
        });
      }
      return await buildAndSendSolanaTransaction({
        client,
        instructions: [instruction],
        senderKeyBytes: signer.keyBytes,
        sponsored,
        gasPolicyId: feePolicyId,
      });
    },
  );

  const confirmed = await withSpinner(
    "Waiting for confirmation...",
    "Confirmation status received",
    () => waitForSolanaConfirmation(client, result.signature),
  );

  if (isJSONMode()) {
    printJSON({
      action: "revoke",
      owner: result.fromAddress,
      tokenAccount: opts.tokenAccount,
      network,
      sponsored,
      signature: result.signature,
      status: confirmed ? "confirmed" : "pending",
    });
    return;
  }

  const pairs: [string, string][] = [
    ["Owner", result.fromAddress],
    ["Token Account", opts.tokenAccount],
    ["Network", network],
  ];

  if (sponsored) {
    pairs.push(["Fee", green("Sponsored")]);
  }

  pairs.push(["Signature", result.signature]);
  pairs.push(["Status", confirmed ? `${successBadge()} ${green("Confirmed")}` : "Pending"]);
  printKeyValue(pairs);
}
