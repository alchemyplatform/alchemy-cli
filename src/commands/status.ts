import { Command } from "commander";
import { buildWalletClient } from "../lib/smart-wallet.js";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { isSolanaNetwork } from "../lib/networks.js";
import {
  readStdinArg,
  validateSolanaSignature,
  validateTxHash,
} from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError, errInvalidArgs } from "../lib/errors.js";
import { formatWithCommas } from "../lib/block-format.js";
import {
  withSpinner,
  printKeyValueBox,
  green,
  red,
  dim,
  successBadge,
  failBadge,
  etherscanTxURL,
} from "../lib/ui.js";

type CanonicalStatus = "confirmed" | "pending" | "failed" | "not_found";

interface SolanaSignatureStatusResult {
  kind: "solana_signature";
  id: string;
  network: string;
  status: CanonicalStatus;
  confirmationStatus: string | null;
  slot: string | null;
  error: unknown;
}

interface EvmOperationStatusResult {
  kind: "evm_operation";
  id: string;
  network: string;
  status: Exclude<CanonicalStatus, "not_found">;
  operationStatus: string | null;
  txHash: string | null;
  blockNumber: string | null;
  gasUsed: string | null;
  error: unknown;
}

interface EvmTransactionStatusResult {
  kind: "evm_transaction";
  id: string;
  network: string;
  status: CanonicalStatus;
  executionStatus: "success" | "reverted" | "pending" | null;
  txHash: string | null;
  blockNumber: string | null;
  gasUsed: string | null;
  from: string | null;
  to: string | null;
  error: unknown;
}

type WalletCallStatusId = Parameters<
  ReturnType<typeof buildWalletClient>["client"]["getCallsStatus"]
>[0]["id"];

export function registerStatus(program: Command) {
  program
    .command("status")
    .description("Check the status of a transaction or operation")
    .argument("[id]", "Operation ID: EVM callId, tx hash, or Solana signature (or pipe via stdin)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy status call-123                               EVM smart wallet operation
  alchemy status 0xTxHash... -n eth-mainnet             Raw EVM transaction
  alchemy status 5wHu1qwD7q... -n solana-devnet         Solana transaction
  echo "call-123" | alchemy status

Tip: use an EVM network for operation IDs and tx hashes, or a Solana network for signatures.`,
    )
    .action(async (idArg?: string) => {
      try {
        const id = normalizeId(idArg ?? (await readStdinArg("id")));
        const network = resolveNetwork(program);

        if (isSolanaNetwork(network)) {
          validateSolanaTarget(id);
          const result = await checkSolanaStatus(program, id, network);
          printStatus(result);
        } else {
          validateEvmTarget(id);
          const result = isTxHash(id)
            ? await checkEvmTransactionStatus(program, id, network)
            : await checkEvmOperationStatus(program, id, network);
          printStatus(result);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Solana status ───────────────────────────────────────────────────

async function checkSolanaStatus(
  program: Command,
  signature: string,
  network: string,
): Promise<SolanaSignatureStatusResult> {
  const client = clientFromFlags(program, { defaultNetwork: "solana-mainnet" });

  const result = await withSpinner(
    "Checking status…",
    "Status retrieved",
    () => client.call("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]),
  ) as { value: Array<{ confirmationStatus?: string; err?: unknown; slot?: number } | null> };

  const status = result.value[0];

  if (!status) {
    return {
      kind: "solana_signature",
      id: signature,
      network,
      status: "not_found",
      confirmationStatus: null,
      slot: null,
      error: null,
    };
  }

  const hasError = status.err != null;
  const confirmationStatus = status.confirmationStatus ?? null;
  const normalizedStatus = hasError
    ? "failed"
    : isSolanaConfirmed(confirmationStatus)
      ? "confirmed"
      : "pending";

  return {
    kind: "solana_signature",
    id: signature,
    network,
    status: normalizedStatus,
    confirmationStatus,
    slot: status.slot != null ? String(status.slot) : null,
    error: hasError ? status.err : null,
  };
}

// ── EVM status ──────────────────────────────────────────────────────

async function checkEvmOperationStatus(
  program: Command,
  id: string,
  network: string,
): Promise<EvmOperationStatusResult> {
  const { client } = buildWalletClient(program);
  const result = await withSpinner(
    "Checking status…",
    "Status retrieved",
    () => client.getCallsStatus({ id: id as WalletCallStatusId }),
  );

  const txHash = result.receipts?.[0]?.transactionHash;
  const blockNumber = result.receipts?.[0]?.blockNumber;
  const gasUsed = result.receipts?.[0]?.gasUsed;
  const operationStatus = String(result.status ?? "unknown");

  return {
    kind: "evm_operation",
    id,
    network,
    status: normalizeOperationStatus(operationStatus),
    operationStatus,
    txHash: txHash ?? null,
    blockNumber: blockNumber != null ? String(blockNumber) : null,
    gasUsed: gasUsed != null ? String(gasUsed) : null,
    error: null,
  };
}

async function checkEvmTransactionStatus(
  program: Command,
  hash: string,
  network: string,
): Promise<EvmTransactionStatusResult> {
  validateTxHash(hash);
  const client = clientFromFlags(program);

  const receipt = await withSpinner(
    "Checking status…",
    "Status retrieved",
    () => client.call("eth_getTransactionReceipt", [hash]),
  ) as {
    status: string;
    transactionHash: string;
    blockNumber: string;
    gasUsed: string;
    from: string;
    to: string | null;
  } | null;

  if (receipt) {
    const executionStatus = receipt.status === "0x1" ? "success" : "reverted";

    return {
      kind: "evm_transaction",
      id: hash,
      network,
      status: executionStatus === "success" ? "confirmed" : "failed",
      executionStatus,
      txHash: receipt.transactionHash,
      blockNumber: String(parseInt(receipt.blockNumber, 16)),
      gasUsed: String(parseInt(receipt.gasUsed, 16)),
      from: receipt.from,
      to: receipt.to,
      error: null,
    };
  }

  const tx = await withSpinner(
    "Checking status…",
    "Status retrieved",
    () => client.call("eth_getTransactionByHash", [hash]),
  ) as {
    hash: string;
    from?: string;
    to?: string | null;
  } | null;

  if (tx) {
    return {
      kind: "evm_transaction",
      id: hash,
      network,
      status: "pending",
      executionStatus: "pending",
      txHash: tx.hash,
      blockNumber: null,
      gasUsed: null,
      from: tx.from ?? null,
      to: tx.to ?? null,
      error: null,
    };
  }

  return {
    kind: "evm_transaction",
    id: hash,
    network,
    status: "not_found",
    executionStatus: null,
    txHash: null,
    blockNumber: null,
    gasUsed: null,
    from: null,
    to: null,
    error: null,
  };
}

function normalizeId(id: string): string {
  const normalized = id.trim();
  if (!normalized) {
    throw errInvalidArgs(
      "Missing <id>. Provide it as an argument or pipe via stdin.",
    );
  }
  return normalized;
}

function validateSolanaTarget(id: string): void {
  if (id.startsWith("0x")) {
    throw errInvalidArgs(
      `Invalid Solana signature "${id}". This looks like an EVM operation ID or transaction hash. Use an EVM network such as \`-n eth-mainnet\`.`,
    );
  }
  validateSolanaSignature(id);
}

function validateEvmTarget(id: string): void {
  if (looksLikeSolanaSignature(id)) {
    throw errInvalidArgs(
      `Invalid EVM ID "${id}". This looks like a Solana transaction signature. Use a Solana network such as \`-n solana-devnet\`.`,
    );
  }
}

function looksLikeSolanaSignature(id: string): boolean {
  try {
    validateSolanaSignature(id);
    return true;
  } catch {
    return false;
  }
}

function isSolanaConfirmed(status: string | null): boolean {
  return status === "confirmed" || status === "finalized";
}

function isTxHash(id: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(id);
}

function normalizeOperationStatus(
  operationStatus: string,
): Exclude<CanonicalStatus, "not_found"> {
  const normalized = operationStatus.toLowerCase();
  if (normalized === "success") {
    return "confirmed";
  }
  if (normalized === "failed" || normalized === "failure" || normalized === "reverted") {
    return "failed";
  }
  return "pending";
}

function printStatus(
  result:
    | SolanaSignatureStatusResult
    | EvmOperationStatusResult
    | EvmTransactionStatusResult,
): void {
  if (isJSONMode()) {
    printJSON(result);
    return;
  }

  if (result.kind === "solana_signature") {
    const pairs: [string, string][] = [
      ["Signature", result.id],
      ["Network", result.network],
      ["Status", formatHumanStatus(result.status, result.confirmationStatus)],
    ];

    if (result.slot != null) {
      pairs.push(["Slot", result.slot]);
    }
    if (result.error != null) {
      pairs.push(["Error", dim(formatError(result.error))]);
    }

    printKeyValueBox(pairs);
    return;
  }

  if (result.kind === "evm_operation") {
    const pairs: [string, string][] = [
      ["Call ID", result.id],
      ["Network", result.network],
      ["Status", formatHumanStatus(result.status, result.operationStatus)],
    ];

    if (result.txHash) {
      pairs.push(["Tx Hash", result.txHash]);
    }
    if (result.blockNumber != null) {
      pairs.push(["Block", formatDecimalQuantity(result.blockNumber)]);
    }
    if (result.gasUsed != null) {
      pairs.push(["Gas Used", formatDecimalQuantity(result.gasUsed)]);
    }

    const explorerURL = result.txHash
      ? etherscanTxURL(result.txHash, result.network)
      : undefined;
    if (explorerURL) {
      pairs.push(["Explorer", explorerURL]);
    }

    printKeyValueBox(pairs);
    return;
  }

  const pairs: [string, string][] = [
    ["Tx Hash", result.txHash ?? result.id],
    ["Network", result.network],
    ["Status", formatHumanStatus(result.status, result.executionStatus)],
  ];

  if (result.blockNumber != null) {
    pairs.push(["Block", formatDecimalQuantity(result.blockNumber)]);
  }
  if (result.gasUsed != null) {
    pairs.push(["Gas Used", formatDecimalQuantity(result.gasUsed)]);
  }
  if (result.from) {
    pairs.push(["From", result.from]);
  }
  if (result.to) {
    pairs.push(["To", result.to]);
  }

  const explorerURL = etherscanTxURL(result.txHash ?? result.id, result.network);
  if (explorerURL) {
    pairs.push(["Explorer", explorerURL]);
  }

  printKeyValueBox(pairs);
}

function formatHumanStatus(
  status: CanonicalStatus,
  detail: string | null,
): string {
  if (status === "confirmed") {
    if (detail && detail !== "success" && detail !== "confirmed") {
      return `${successBadge()} ${green(`Confirmed (${detail})`)}`;
    }
    return `${successBadge()} ${green("Confirmed")}`;
  }
  if (status === "failed") {
    const message = detail ? red(`Failed (${detail})`) : red("Failed");
    return `${failBadge()} ${message}`;
  }
  if (status === "pending") {
    if (detail === "pending") {
      return "Pending";
    }
    return detail ? `Pending (${detail})` : "Pending";
  }
  return "Not found";
}

function formatDecimalQuantity(value: string): string {
  try {
    return formatWithCommas(BigInt(value));
  } catch {
    return value;
  }
}

function formatError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
