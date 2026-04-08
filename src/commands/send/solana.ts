import { Command } from "commander";
import { address as solAddress } from "@solana/kit";
import {
  clientFromFlags,
  resolveNetwork,
  resolveGasSponsored,
  resolveGasPolicyId,
  resolveSolanaWalletKey,
} from "../../lib/resolve.js";
import { validateSolanaAddress } from "../../lib/validators.js";
import { nativeTokenSymbol } from "../../lib/networks.js";
import { isJSONMode, printJSON } from "../../lib/output.js";
import { errInvalidArgs, errSolanaWalletKeyRequired } from "../../lib/errors.js";
import { withSpinner, printKeyValueBox, green } from "../../lib/ui.js";
import {
  parseSolanaKeyBytes,
  buildSolTransferInstruction,
  buildAndSendSolanaTransaction,
  waitForSolanaConfirmation,
  SOL_DECIMALS,
} from "../../lib/solana-tx.js";
import { parseAmount } from "./shared.js";

export async function performSolanaSend(
  program: Command,
  toArg: string,
  amountArg: string,
  tokenAddress?: string,
) {
  if (tokenAddress) {
    throw errInvalidArgs("SPL token transfers are not yet supported. Omit --token for native SOL transfers.");
  }

  const solanaKey = resolveSolanaWalletKey(program);
  if (!solanaKey) {
    throw errSolanaWalletKeyRequired();
  }
  const keyBytes = parseSolanaKeyBytes(solanaKey);

  validateSolanaAddress(toArg);
  const to = solAddress(toArg);

  const network = resolveNetwork(program);
  const symbol = nativeTokenSymbol(network);
  const lamports = parseAmount(amountArg, SOL_DECIMALS);

  const { createKeyPairSignerFromBytes, createKeyPairSignerFromPrivateKeyBytes } = await import("@solana/kit");
  const signer = keyBytes.length === 64
    ? await createKeyPairSignerFromBytes(keyBytes, true)
    : await createKeyPairSignerFromPrivateKeyBytes(keyBytes, true);

  const instruction = buildSolTransferInstruction(signer, to, lamports);

  const sponsored = resolveGasSponsored(program);
  const gasPolicyId = resolveGasPolicyId(program);

  if (sponsored && !gasPolicyId) {
    throw errInvalidArgs(
      "Gas sponsorship requires a gas policy ID. Set one with --gas-policy-id or `alchemy config set gas-policy-id <id>`.",
    );
  }

  const client = clientFromFlags(program, { defaultNetwork: "solana-mainnet" });

  const result = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    () => buildAndSendSolanaTransaction({
      client,
      instructions: [instruction],
      senderKeyBytes: keyBytes,
      sponsored,
      gasPolicyId,
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
      pairs.push(["Gas", green("Sponsored")]);
    }

    pairs.push(["Signature", result.signature]);
    pairs.push(["Status", confirmed ? green("Confirmed") : "Pending"]);

    printKeyValueBox(pairs);
  }
}
