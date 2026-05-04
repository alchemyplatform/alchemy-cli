import { Command } from "commander";
import { clientFromFlags, resolveSolanaNetwork } from "../lib/resolve.js";
import { CLIError, ErrorCode, errInvalidArgs, exitWithError } from "../lib/errors.js";
import { parseOptionalInt, parseRequiredJSON } from "../lib/params.js";
import { validateSolanaAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { dim, green, printKeyValueBox, printTable, withSpinner } from "../lib/ui.js";

interface SolanaRpcAccount {
  lamports?: number;
  owner?: string;
  executable?: boolean;
  rentEpoch?: number | string;
  data?: unknown;
}

interface ProgramAccount {
  pubkey: string;
  account: SolanaRpcAccount;
}

function dataLength(data: unknown): number | null {
  if (typeof data === "string") {
    return data.length;
  }
  if (Array.isArray(data) && typeof data[0] === "string") {
    return data[0].length;
  }
  return null;
}

function parseEncoding(value: string | undefined): string {
  return value ?? "base64";
}

function parseFilters(value: string | undefined): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = parseRequiredJSON<unknown>(value, "--filters");
  if (!Array.isArray(parsed)) {
    throw errInvalidArgs("--filters must be a JSON array.");
  }
  return parsed;
}

function isSecondaryIndexExclusionError(err: unknown): err is CLIError {
  return err instanceof CLIError &&
    err.code === ErrorCode.RPC_ERROR &&
    err.message.toLowerCase().includes("excluded from account secondary indexes");
}

async function fetchProgramAccounts(args: {
  client: ReturnType<typeof clientFromFlags>;
  programId: string;
  config: Record<string, unknown>;
}): Promise<ProgramAccount[]> {
  try {
    return await args.client.call("getProgramAccounts", [
      args.programId,
      args.config,
    ]) as ProgramAccount[];
  } catch (err) {
    if (isSecondaryIndexExclusionError(err)) {
      throw new CLIError(
        ErrorCode.RPC_ERROR,
        err.message,
        "This program is excluded from broad account scans by the RPC node. Add a narrow --filters JSON array, or use 'alchemy solana program account <address>' for a known account.",
        err.details,
        err.data,
      );
    }
    throw err;
  }
}

export function registerSolanaProgram(program: Command) {
  const cmd = program
    .command("program")
    .description("Inspect Solana program accounts");

  cmd
    .command("accounts <program-id>")
    .description("List accounts owned by a Solana program")
    .option("--filters <json>", "JSON-RPC getProgramAccounts filters array")
    .option("--encoding <encoding>", "Account data encoding (default: base64)")
    .option("--limit <n>", "Limit displayed accounts")
    .action(async (programId: string, opts: { filters?: string; encoding?: string; limit?: string }) => {
      try {
        await performSolanaProgramAccounts(program, programId, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("account <address>")
    .description("Show a Solana account")
    .option("--encoding <encoding>", "Account data encoding (default: base64)")
    .action(async (accountAddress: string, opts: { encoding?: string }) => {
      try {
        await performSolanaProgramAccount(program, accountAddress, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("show <program-id>")
    .description("Show Solana program account metadata")
    .action(async (programId: string) => {
      try {
        await performSolanaProgramShow(program, programId);
      } catch (err) {
        exitWithError(err);
      }
    });
}

export async function performSolanaProgramAccounts(
  program: Command,
  programId: string,
  opts: { filters?: string; encoding?: string; limit?: string },
): Promise<void> {
  validateSolanaAddress(programId);
  const filters = parseFilters(opts.filters);
  const limit = parseOptionalInt(opts.limit, "--limit");
  const encoding = parseEncoding(opts.encoding);
  const network = resolveSolanaNetwork(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  const config: Record<string, unknown> = { encoding };
  if (filters !== undefined) {
    config.filters = filters;
  }

  const accounts = await withSpinner(
    "Fetching program accounts...",
    "Program accounts fetched",
    () => fetchProgramAccounts({ client, programId, config }),
  );
  const displayedAccounts = limit === undefined ? accounts : accounts.slice(0, limit);

  if (isJSONMode()) {
    printJSON({
      programId,
      network,
      count: accounts.length,
      accounts: displayedAccounts,
    });
    return;
  }

  if (displayedAccounts.length === 0) {
    printKeyValueBox([
      ["Program", programId],
      ["Network", network],
      ["Accounts", dim("none")],
    ]);
    return;
  }

  printTable(
    ["Address", "Lamports", "Owner", "Data"],
    displayedAccounts.map((entry) => [
      entry.pubkey,
      entry.account.lamports?.toString() ?? "",
      entry.account.owner ?? "",
      dataLength(entry.account.data)?.toString() ?? "",
    ]),
  );
}

export async function performSolanaProgramAccount(
  program: Command,
  accountAddress: string,
  opts: { encoding?: string },
): Promise<void> {
  validateSolanaAddress(accountAddress);
  const encoding = parseEncoding(opts.encoding);
  const network = resolveSolanaNetwork(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  const result = await withSpinner(
    "Fetching account...",
    "Account fetched",
    () => client.call("getAccountInfo", [accountAddress, { encoding }]) as Promise<{ value: SolanaRpcAccount | null }>,
  );

  if (isJSONMode()) {
    printJSON({
      address: accountAddress,
      network,
      account: result.value,
    });
    return;
  }

  if (result.value === null) {
    printKeyValueBox([
      ["Address", accountAddress],
      ["Network", network],
      ["Status", dim("not found")],
    ]);
    return;
  }

  printAccountSummary({
    label: "Address",
    address: accountAddress,
    network,
    account: result.value,
  });
}

export async function performSolanaProgramShow(
  program: Command,
  programId: string,
): Promise<void> {
  validateSolanaAddress(programId);
  const network = resolveSolanaNetwork(program);
  const client = clientFromFlags(program, { forceNetwork: network });

  const result = await withSpinner(
    "Fetching program...",
    "Program fetched",
    () => client.call("getAccountInfo", [programId, { encoding: "base64" }]) as Promise<{ value: SolanaRpcAccount | null }>,
  );

  if (isJSONMode()) {
    printJSON({
      programId,
      network,
      account: result.value,
    });
    return;
  }

  if (result.value === null) {
    printKeyValueBox([
      ["Program", programId],
      ["Network", network],
      ["Status", dim("not found")],
    ]);
    return;
  }

  printAccountSummary({
    label: "Program",
    address: programId,
    network,
    account: result.value,
  });
}

function printAccountSummary(args: {
  label: string;
  address: string;
  network: string;
  account: SolanaRpcAccount;
}): void {
  printKeyValueBox([
    [args.label, args.address],
    ["Owner", args.account.owner ?? dim("unknown")],
    ["Lamports", args.account.lamports?.toString() ?? dim("unknown")],
    ["Executable", args.account.executable ? green("true") : "false"],
    ["Rent Epoch", args.account.rentEpoch?.toString() ?? dim("unknown")],
    ["Data Bytes", dataLength(args.account.data)?.toString() ?? dim("unknown")],
    ["Network", args.network],
  ]);
}
