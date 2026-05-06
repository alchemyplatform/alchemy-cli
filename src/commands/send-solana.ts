import { Command } from "commander";
import { address as solAddress } from "@solana/kit";
import {
  clientFromFlags,
  resolveSolanaNetwork,
  resolveSolanaWalletKey,
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
  waitForSolanaConfirmation,
  SOL_DECIMALS,
} from "../lib/solana-tx.js";
import { resolveSolanaFeeSponsorship } from "../lib/solana-fees.js";
import { parseAmount } from "../lib/token-amounts.js";

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
  if (opts.signer === "session") {
    throw errInvalidArgs(
      "The session wallet does not yet support Solana. Use `--signer local` or configure a local Solana wallet with `alchemy wallet connect --mode local --chain solana`.",
    );
  }

  const solanaKey = resolveSolanaWalletKey(program);
  if (!solanaKey) {
    throw errSolanaWalletKeyRequired();
  }
  const keyBytes = parseSolanaKeyBytes(solanaKey);

  validateSolanaAddress(toArg);
  const to = solAddress(toArg);

  const network = resolveSolanaNetwork(program);
  const symbol = nativeTokenSymbol(network);
  const lamports = parseAmount(amountArg, SOL_DECIMALS);

  const signer = await createSolanaSignerFromKeyBytes(keyBytes);
  const instruction = buildSolTransferInstruction(signer, to, lamports);

  const { sponsored, feePolicyId } = resolveSolanaFeeSponsorship(program);

  const client = clientFromFlags(program, { forceNetwork: network });

  const result = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    () => buildAndSendSolanaTransaction({
      client,
      instructions: [instruction],
      senderKeyBytes: keyBytes,
      sponsored,
      gasPolicyId: feePolicyId,
    }),
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
