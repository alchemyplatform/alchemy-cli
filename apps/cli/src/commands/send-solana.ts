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
import {
  assertTokenAccountMatches,
  buildCreateAssociatedTokenAccountIdempotentInstruction,
  buildSplTokenTransferCheckedInstruction,
  deriveAssociatedTokenAccount,
  fetchSplMintInfo,
  fetchSplTokenAccountInfo,
} from "../lib/solana-token.js";
import type { AlchemyClient } from "../lib/client-interface.js";
import type { Instruction } from "@solana/kit";

interface SolanaSendOptions {
  signer?: "session" | "local";
  dryRun?: boolean;
  failIfAssociatedTokenAccountMissing?: boolean;
  fromTokenAccount?: string;
  recipientTokenAccount?: string;
}

interface SolanaSendSubmission {
  signature: string;
  fromAddress: string;
}

interface SplSendPlan {
  instructions: Instruction[];
  mint: string;
  tokenProgramAddress: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  createdDestinationTokenAccount: boolean;
  decimals: number;
}

export function registerSolanaSend(program: Command) {
  const sendCmd = program
    .command("send <to> <amount>")
    .description("Send SOL or SPL tokens to an address")
    .option("--token <mint>", "SPL token mint address (omit for native SOL)")
    .option("--dry-run", "Preview transaction without signing or sending")
    .option("--fail-if-associated-token-account-missing", "Fail if the recipient associated token account is missing")
    .option("--from-token-account <address>", "Source SPL token account (defaults to sender associated token account)")
    .option("--recipient-token-account <address>", "Destination SPL token account (defaults to recipient associated token account)")
    .option("--fee-sponsored", "Enable Solana fee sponsorship")
    .option("--fee-policy-id <id>", "Solana fee policy ID for sponsorship")
    .addHelpText(
      "after",
      `
Examples:
  alchemy solana send <pubkey> 0.1
  alchemy solana send <pubkey> 10 --token <mint>
  alchemy solana send <pubkey> 10 --token <mint> --dry-run
  alchemy solana send <pubkey> 10 --token <mint> --fail-if-associated-token-account-missing`,
    );
  addSignerOption(sendCmd);
  sendCmd.action(
    async (
      toArg: string,
      amountArg: string,
      _opts: unknown,
      actionCommand: Command,
    ) => {
      try {
        const opts = actionCommand.opts<{
          token?: string;
          signer?: string;
          dryRun?: boolean;
          failIfAssociatedTokenAccountMissing?: boolean;
          fromTokenAccount?: string;
          recipientTokenAccount?: string;
        }>();
        await performSolanaSend(actionCommand, toArg, amountArg, opts.token, {
          signer: parseSignerOpt(opts.signer),
          dryRun: opts.dryRun,
          failIfAssociatedTokenAccountMissing: opts.failIfAssociatedTokenAccountMissing,
          fromTokenAccount: opts.fromTokenAccount,
          recipientTokenAccount: opts.recipientTokenAccount,
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
  opts: SolanaSendOptions = {},
) {
  validateSolanaTokenOptions(tokenAddress, opts);

  const signer = await resolveSolanaSigner(program, opts.signer);

  validateSolanaAddress(toArg);
  const to = solAddress(toArg);

  const network = resolveSolanaNetwork(program);
  const { sponsored, feePolicyId } = await resolveSolanaFeeSponsorship(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  if (tokenAddress) {
    await performSplTokenSend({
      client,
      signer,
      to,
      toArg,
      amountArg,
      tokenAddress,
      network,
      sponsored,
      feePolicyId,
      opts,
    });
    return;
  }

  await performNativeSolSend({
    client,
    signer,
    to,
    toArg,
    amountArg,
    network,
    sponsored,
    feePolicyId,
    dryRun: opts.dryRun,
  });
}

async function performNativeSolSend(args: {
  client: AlchemyClient;
  signer: ResolvedSolanaSigner;
  to: ReturnType<typeof solAddress>;
  toArg: string;
  amountArg: string;
  network: string;
  sponsored: boolean;
  feePolicyId?: string;
  dryRun?: boolean;
}) {
  const symbol = nativeTokenSymbol(args.network);
  const lamports = parseAmount(args.amountArg, SOL_DECIMALS);

  const instruction = buildSolTransferInstruction(
    { address: solAddress(args.signer.address) },
    args.to,
    lamports,
  );

  if (args.dryRun) {
    printNativeDryRun({
      from: args.signer.address,
      to: args.toArg,
      amount: args.amountArg,
      symbol,
      network: args.network,
      sponsored: args.sponsored,
    });
    return;
  }

  const result = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    async () => {
      if (args.signer.type === "session") {
        return await buildAndSendSolanaTransactionWithSession({
          client: args.client,
          instructions: [instruction],
          session: args.signer.session,
          authToken: args.signer.authToken,
          sponsored: args.sponsored,
          gasPolicyId: args.feePolicyId,
        });
      }
      return await buildAndSendSolanaTransaction({
        client: args.client,
        instructions: [instruction],
        senderKeyBytes: args.signer.keyBytes,
        sponsored: args.sponsored,
        gasPolicyId: args.feePolicyId,
      });
    },
  );

  const confirmed = await withSpinner(
    "Waiting for confirmation…",
    "Confirmation status received",
    () => waitForSolanaConfirmation(args.client, result.signature),
  );

  printNativeResult({
    result,
    to: args.toArg,
    amount: args.amountArg,
    symbol,
    network: args.network,
    sponsored: args.sponsored,
    status: confirmed ? "confirmed" : "pending",
  });
}

function validateSolanaTokenOptions(
  tokenAddress: string | undefined,
  opts: SolanaSendOptions,
): void {
  if (tokenAddress) return;

  const splOnlyFlags = [
    opts.fromTokenAccount ? "--from-token-account" : undefined,
    opts.recipientTokenAccount ? "--recipient-token-account" : undefined,
    opts.failIfAssociatedTokenAccountMissing ? "--fail-if-associated-token-account-missing" : undefined,
  ].filter((flag): flag is string => flag !== undefined);

  if (splOnlyFlags.length === 0) return;

  throw errInvalidArgs(
    `${splOnlyFlags.join(", ")} ${splOnlyFlags.length === 1 ? "requires" : "require"} --token <mint>.`,
  );
}

async function performSplTokenSend(args: {
  client: AlchemyClient;
  signer: ResolvedSolanaSigner;
  to: ReturnType<typeof solAddress>;
  toArg: string;
  amountArg: string;
  tokenAddress: string;
  network: string;
  sponsored: boolean;
  feePolicyId?: string;
  opts: SolanaSendOptions;
}) {
  validateSolanaAddress(args.tokenAddress);
  if (args.opts.fromTokenAccount) validateSolanaAddress(args.opts.fromTokenAccount);
  if (args.opts.recipientTokenAccount) validateSolanaAddress(args.opts.recipientTokenAccount);

  const mint = solAddress(args.tokenAddress);
  const owner = solAddress(args.signer.address);
  const mintInfo = await fetchSplMintInfo(args.client, mint);
  const amount = parseAmount(args.amountArg, mintInfo.decimals);
  const plan = await buildSplSendPlan({
    client: args.client,
    owner,
    recipient: args.to,
    mint,
    amount,
    decimals: mintInfo.decimals,
    tokenProgramAddress: mintInfo.tokenProgramAddress,
    failIfAssociatedTokenAccountMissing: Boolean(args.opts.failIfAssociatedTokenAccountMissing),
    fromTokenAccount: args.opts.fromTokenAccount
      ? solAddress(args.opts.fromTokenAccount)
      : undefined,
    recipientTokenAccount: args.opts.recipientTokenAccount
      ? solAddress(args.opts.recipientTokenAccount)
      : undefined,
  });

  if (args.opts.dryRun) {
    printSplDryRun({
      from: args.signer.address,
      to: args.toArg,
      amount: args.amountArg,
      network: args.network,
      sponsored: args.sponsored,
      plan,
    });
    return;
  }

  const result = await submitSolanaInstructions({
    client: args.client,
    signer: args.signer,
    instructions: plan.instructions,
    sponsored: args.sponsored,
    feePolicyId: args.feePolicyId,
  });

  const confirmed = await withSpinner(
    "Waiting for confirmation…",
    "Confirmation status received",
    () => waitForSolanaConfirmation(args.client, result.signature),
  );

  printSplResult({
    result,
    to: args.toArg,
    amount: args.amountArg,
    network: args.network,
    sponsored: args.sponsored,
    plan,
    status: confirmed ? "confirmed" : "pending",
  });
}

async function buildSplSendPlan(args: {
  client: AlchemyClient;
  owner: ReturnType<typeof solAddress>;
  recipient: ReturnType<typeof solAddress>;
  mint: ReturnType<typeof solAddress>;
  amount: bigint;
  decimals: number;
  tokenProgramAddress: ReturnType<typeof solAddress>;
  failIfAssociatedTokenAccountMissing: boolean;
  fromTokenAccount?: ReturnType<typeof solAddress>;
  recipientTokenAccount?: ReturnType<typeof solAddress>;
}): Promise<SplSendPlan> {
  const sourceTokenAccount = args.fromTokenAccount ?? await deriveAssociatedTokenAccount({
    owner: args.owner,
    mint: args.mint,
    tokenProgramAddress: args.tokenProgramAddress,
  });
  const sourceAccount = await fetchSplTokenAccountInfo(args.client, sourceTokenAccount);
  if (!sourceAccount) {
    throw errInvalidArgs(
      `Source token account ${sourceTokenAccount} was not found. Fund the sender's associated token account for mint ${args.mint} and retry.`,
    );
  }
  assertTokenAccountMatches({
    account: sourceAccount,
    expectedMint: args.mint,
    expectedOwner: args.owner,
    label: "Source token account",
  });

  const destinationTokenAccount = args.recipientTokenAccount ?? await deriveAssociatedTokenAccount({
    owner: args.recipient,
    mint: args.mint,
    tokenProgramAddress: args.tokenProgramAddress,
  });
  const destinationAccount = await fetchSplTokenAccountInfo(args.client, destinationTokenAccount);
  const createDestinationTokenAccount = !destinationAccount
    && !args.recipientTokenAccount
    && !args.failIfAssociatedTokenAccountMissing;
  if (!destinationAccount && args.recipientTokenAccount) {
    throw errInvalidArgs(`Recipient token account ${destinationTokenAccount} was not found.`);
  }
  if (!destinationAccount && args.failIfAssociatedTokenAccountMissing) {
    throw errInvalidArgs(
      `Recipient associated token account ${destinationTokenAccount} does not exist. Omit --fail-if-associated-token-account-missing to create it automatically.`,
    );
  }
  if (destinationAccount) {
    assertTokenAccountMatches({
      account: destinationAccount,
      expectedMint: args.mint,
      ...(args.recipientTokenAccount ? {} : { expectedOwner: args.recipient }),
      label: "Recipient token account",
    });
  }

  const instructions: Instruction[] = [];
  if (createDestinationTokenAccount) {
    instructions.push(buildCreateAssociatedTokenAccountIdempotentInstruction({
      payer: { address: args.owner },
      associatedTokenAccount: destinationTokenAccount,
      owner: args.recipient,
      mint: args.mint,
      tokenProgramAddress: args.tokenProgramAddress,
    }));
  }
  instructions.push(buildSplTokenTransferCheckedInstruction({
    sourceTokenAccount,
    mint: args.mint,
    destinationTokenAccount,
    owner: { address: args.owner },
    amount: args.amount,
    decimals: args.decimals,
    tokenProgramAddress: args.tokenProgramAddress,
  }));

  return {
    instructions,
    mint: args.mint,
    tokenProgramAddress: args.tokenProgramAddress,
    sourceTokenAccount,
    destinationTokenAccount,
    createdDestinationTokenAccount: createDestinationTokenAccount,
    decimals: args.decimals,
  };
}

async function submitSolanaInstructions(args: {
  client: AlchemyClient;
  signer: ResolvedSolanaSigner;
  instructions: Instruction[];
  sponsored: boolean;
  feePolicyId?: string;
}): Promise<SolanaSendSubmission> {
  const result = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    async () => {
      if (args.signer.type === "session") {
        return await buildAndSendSolanaTransactionWithSession({
          client: args.client,
          instructions: args.instructions,
          session: args.signer.session,
          authToken: args.signer.authToken,
          sponsored: args.sponsored,
          gasPolicyId: args.feePolicyId,
        });
      }
      return await buildAndSendSolanaTransaction({
        client: args.client,
        instructions: args.instructions,
        senderKeyBytes: args.signer.keyBytes,
        sponsored: args.sponsored,
        gasPolicyId: args.feePolicyId,
      });
    },
  );
  return result;
}

function printNativeDryRun(args: {
  from: string;
  to: string;
  amount: string;
  symbol: string;
  network: string;
  sponsored: boolean;
}) {
  if (isJSONMode()) {
    printJSON({
      dryRun: true,
      action: "solana-send",
      from: args.from,
      to: args.to,
      amount: args.amount,
      token: args.symbol,
      network: args.network,
      sponsored: args.sponsored,
      instructions: ["transferSol"],
    });
    return;
  }

  const pairs: [string, string][] = [
    ["Dry Run", "yes"],
    ["From", args.from],
    ["To", args.to],
    ["Amount", green(`${args.amount} ${args.symbol}`)],
    ["Network", args.network],
    ["Instructions", "transferSol"],
  ];
  if (args.sponsored) pairs.push(["Fee", green("Sponsored")]);
  printKeyValue(pairs);
}

function printNativeResult(args: {
  result: SolanaSendSubmission;
  to: string;
  amount: string;
  symbol: string;
  network: string;
  sponsored: boolean;
  status: "confirmed" | "pending";
}) {
  if (isJSONMode()) {
    printJSON({
      from: args.result.fromAddress,
      to: args.to,
      amount: args.amount,
      token: args.symbol,
      network: args.network,
      sponsored: args.sponsored,
      signature: args.result.signature,
      status: args.status,
    });
    return;
  }

  const pairs: [string, string][] = [
    ["From", args.result.fromAddress],
    ["To", args.to],
    ["Amount", green(`${args.amount} ${args.symbol}`)],
    ["Network", args.network],
  ];
  if (args.sponsored) pairs.push(["Fee", green("Sponsored")]);
  pairs.push(["Signature", args.result.signature]);
  pairs.push(["Status", args.status === "confirmed" ? `${successBadge()} ${green("Confirmed")}` : "Pending"]);
  printKeyValue(pairs);
}

function printSplDryRun(args: {
  from: string;
  to: string;
  amount: string;
  network: string;
  sponsored: boolean;
  plan: SplSendPlan;
}) {
  const instructions = args.plan.createdDestinationTokenAccount
    ? ["createAssociatedTokenAccountIdempotent", "transferChecked"]
    : ["transferChecked"];
  if (isJSONMode()) {
    printJSON({
      dryRun: true,
      action: "solana-send",
      from: args.from,
      to: args.to,
      amount: args.amount,
      token: args.plan.mint,
      tokenAddress: args.plan.mint,
      network: args.network,
      sponsored: args.sponsored,
      tokenProgramAddress: args.plan.tokenProgramAddress,
      sourceTokenAccount: args.plan.sourceTokenAccount,
      destinationTokenAccount: args.plan.destinationTokenAccount,
      createdDestinationTokenAccount: args.plan.createdDestinationTokenAccount,
      instructions,
    });
    return;
  }

  const pairs: [string, string][] = [
    ["Dry Run", "yes"],
    ["From", args.from],
    ["To", args.to],
    ["Amount", green(`${args.amount} ${args.plan.mint}`)],
    ["Mint", args.plan.mint],
    ["Source Token Account", args.plan.sourceTokenAccount],
    ["Destination Token Account", args.plan.destinationTokenAccount],
    ["Created Destination Token Account", args.plan.createdDestinationTokenAccount ? "yes" : "no"],
    ["Network", args.network],
    ["Instructions", instructions.join(", ")],
  ];
  if (args.sponsored) pairs.push(["Fee", green("Sponsored")]);
  printKeyValue(pairs);
}

function printSplResult(args: {
  result: SolanaSendSubmission;
  to: string;
  amount: string;
  network: string;
  sponsored: boolean;
  plan: SplSendPlan;
  status: "confirmed" | "pending";
}) {
  if (isJSONMode()) {
    printJSON({
      from: args.result.fromAddress,
      to: args.to,
      amount: args.amount,
      token: args.plan.mint,
      tokenAddress: args.plan.mint,
      network: args.network,
      sponsored: args.sponsored,
      tokenProgramAddress: args.plan.tokenProgramAddress,
      sourceTokenAccount: args.plan.sourceTokenAccount,
      destinationTokenAccount: args.plan.destinationTokenAccount,
      createdDestinationTokenAccount: args.plan.createdDestinationTokenAccount,
      signature: args.result.signature,
      status: args.status,
    });
    return;
  }

  const pairs: [string, string][] = [
    ["From", args.result.fromAddress],
    ["To", args.to],
    ["Amount", green(`${args.amount} ${args.plan.mint}`)],
    ["Mint", args.plan.mint],
    ["Source Token Account", args.plan.sourceTokenAccount],
    ["Destination Token Account", args.plan.destinationTokenAccount],
    ["Created Destination Token Account", args.plan.createdDestinationTokenAccount ? "yes" : "no"],
    ["Network", args.network],
  ];
  if (args.sponsored) pairs.push(["Fee", green("Sponsored")]);
  pairs.push(["Signature", args.result.signature]);
  pairs.push(["Status", args.status === "confirmed" ? `${successBadge()} ${green("Confirmed")}` : "Pending"]);
  printKeyValue(pairs);
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
