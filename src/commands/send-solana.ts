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
import { validateSolanaAddress } from "../lib/validators.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import {
  errInvalidArgs,
  errSolanaWalletKeyRequired,
  exitWithError,
} from "../lib/errors.js";
import { withSpinner, printKeyValue, green, successBadge } from "../lib/ui.js";
import { addSignerOption, parseSignerOpt } from "../lib/params.js";
import {
  parseSolanaKeyBytes,
  createSolanaSignerFromKeyBytes,
  buildSolTransferInstruction,
  buildAndSendSolanaTransaction,
  buildAndSendSolanaTransactionWithSession,
  waitForSolanaConfirmation,
  SOL_DECIMALS,
} from "../lib/solana-tx.js";
import { resolveSolanaFeeSponsorship } from "../lib/solana-fees.js";
import { parseAmount } from "../lib/token-amounts.js";
import { getWalletSessionByChain } from "../lib/wallet-session.js";

export function registerSolanaSend(program: Command) {
  const sendCmd = program
    .command("send <to> <amount>")
    .description("Send SOL to an address")
    .option("--token <address>", "SPL token contract address (not yet supported)")
    .option("--fee-sponsored", "Enable Solana fee sponsorship")
    .option("--fee-policy-id <id>", "Solana fee policy ID for sponsorship");
  addSignerOption(sendCmd);
  sendCmd.action(
    async (
      toArg: string,
      amountArg: string,
      _opts: unknown,
      actionCommand: Command,
    ) => {
      try {
        const opts = actionCommand.opts<{ token?: string; signer?: string }>();
        await performSolanaSend(actionCommand, toArg, amountArg, opts.token, {
          signer: parseSignerOpt(opts.signer),
        });
      } catch (err) {
        exitWithError(err);
      }
    },
  );
}

export async function performSolanaSend(
  program: Command,
  toArg: string,
  amountArg: string,
  tokenAddress?: string,
  opts: { signer?: "session" | "local" } = {},
) {
  if (tokenAddress) {
    throw errInvalidArgs("SPL token transfers are not yet supported. Omit --token for native SOL transfers.");
  }
  const signer = await resolveSolanaSigner(program, opts.signer);

  validateSolanaAddress(toArg);
  const to = solAddress(toArg);

  const network = resolveSolanaNetwork(program);
  const symbol = nativeTokenSymbol(network);
  const lamports = parseAmount(amountArg, SOL_DECIMALS);

  const instruction = buildSolTransferInstruction(
    { address: solAddress(signer.address) },
    to,
    lamports,
  );

  const { sponsored, feePolicyId } = await resolveSolanaFeeSponsorship(program);

  const client = clientFromFlags(program, { forceNetwork: network });

  const result = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
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
    "Waiting for confirmation…",
    "Confirmation status received",
    () => waitForSolanaConfirmation(client, result.signature),
  );

  if (isJSONMode()) {
    printJSON({
      from: result.fromAddress,
      to: toArg,
      amount: amountArg,
      token: symbol,
      network,
      sponsored,
      signature: result.signature,
      status: confirmed ? "confirmed" : "pending",
    });
  } else {
    const pairs: [string, string][] = [
      ["From", result.fromAddress],
      ["To", toArg],
      ["Amount", green(`${amountArg} ${symbol}`)],
      ["Network", network],
    ];

    if (sponsored) {
      pairs.push(["Fee", green("Sponsored")]);
    }

    pairs.push(["Signature", result.signature]);
    pairs.push(["Status", confirmed ? `${successBadge()} ${green("Confirmed")}` : "Pending"]);

    printKeyValue(pairs);
  }
}

type ResolvedSolanaSigner =
  | {
      type: "session";
      address: string;
      session: NonNullable<ReturnType<typeof resolveWalletSession>>;
      authToken: string;
    }
  | {
      type: "local";
      address: string;
      keyBytes: Uint8Array;
    };

async function resolveSolanaSigner(
  program: Command,
  signer: "session" | "local" | undefined,
): Promise<ResolvedSolanaSigner> {
  if (signer === "session") {
    return resolveSessionSolanaSigner();
  }

  if (signer === undefined && resolveActiveSigner(program) === "session") {
    return resolveSessionSolanaSigner();
  }

  const solanaKey = resolveSolanaWalletKey(program);
  if (!solanaKey) {
    if (signer === undefined) {
      const authToken = resolveAuthToken();
      const session = resolveWalletSession();
      const solanaSession = session
        ? getWalletSessionByChain(session, "solana")
        : null;
      if (authToken && solanaSession?.solanaAddress) {
        return {
          type: "session",
          address: solanaSession.solanaAddress,
          session: solanaSession,
          authToken,
        };
      }
    }
    throw errSolanaWalletKeyRequired();
  }
  const keyBytes = parseSolanaKeyBytes(solanaKey);
  const localSigner = await createSolanaSignerFromKeyBytes(keyBytes);
  return {
    type: "local",
    address: localSigner.address,
    keyBytes,
  };
}

function resolveSessionSolanaSigner(): Extract<ResolvedSolanaSigner, { type: "session" }> {
  const sessionSigner = tryResolveSessionSolanaSigner();
  if (!sessionSigner) {
    throw errInvalidArgs(
      "No active Solana wallet session. Run `alchemy wallet connect --mode session` first.",
    );
  }
  return sessionSigner;
}

function tryResolveSessionSolanaSigner(): Extract<ResolvedSolanaSigner, { type: "session" }> | undefined {
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
