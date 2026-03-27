import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable, emptyState, printKeyValueBox, printSyntaxJSON } from "../lib/ui.js";
import { validateAddress, resolveAddress, readStdinArg } from "../lib/validators.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { promptSelect } from "../lib/terminal-ui.js";

interface TokenResponse {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
  }>;
  pageKey?: string;
}

type PaginationAction = "next" | "stop";

async function promptTokensPagination(): Promise<PaginationAction> {
  const action = await promptSelect({
    message: "More token balances available",
    options: [
      { label: "Load next page", value: "next" },
      { label: "Stop here", value: "stop" },
    ],
    initialValue: "next",
    cancelMessage: "Stopped pagination.",
  });
  if (action === null) return "stop";
  return action as PaginationAction;
}

function formatTokenRows(balances: TokenResponse["tokenBalances"]): string[][] {
  const nonZero = balances.filter(
    (tb) =>
      tb.tokenBalance !== "0x0" &&
      tb.tokenBalance !==
        "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
  return nonZero.map((tb) => {
    let decimalBalance = dim("unparseable");
    try {
      decimalBalance = BigInt(tb.tokenBalance).toString();
    } catch {
      // Keep fallback when provider returns unexpected non-hex content.
    }
    return [tb.contractAddress, decimalBalance, tb.tokenBalance];
  });
}

export function registerTokens(program: Command) {
  const cmd = program
    .command("tokens")
    .description("Token API wrappers");

  // ── tokens balances ───────────────────────────────────────────────

  cmd
    .command("balances")
    .argument("[address]", "Wallet address or ENS name, or pipe via stdin")
    .description("Get ERC-20 token balances for an address")
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens balances 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy tokens balances

Tip: use 'alchemy tokens metadata <contract>' to get decimals and symbol for a token.`,
    )
    .action(async (addressArg: string | undefined, opts: { pageKey?: string }) => {
      try {
        const addressInput = addressArg ?? (await readStdinArg("address"));
        const client = clientFromFlags(program);
        const address = await resolveAddress(addressInput, client);

        const params: unknown[] = [address];
        if (opts.pageKey) {
          params.push("erc20", { pageKey: opts.pageKey });
        }

        const result = await withSpinner("Fetching token balances…", "Token balances fetched", () =>
          client.call("alchemy_getTokenBalances", params),
        ) as TokenResponse;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        const rows = formatTokenRows(result.tokenBalances);

        if (rows.length === 0) {
          emptyState("No token balances found.");
          return;
        }

        let totalShown = rows.length;

        printKeyValueBox([
          ["Address", address],
          ["Network", client.network],
          ["Tokens", String(totalShown)],
        ]);
        printTable(["Contract", "Balance (base units)", "Raw (hex)"], rows);
        console.log(`\n  ${dim(`${totalShown} tokens (zero balances hidden).`)}`);
        console.log(`  ${dim("Tip: use 'alchemy tokens metadata <contract>' to get decimals and symbol.")}`);

        if (verbose) {
          console.log("");
          printJSON(result);
        }

        const interactive = isInteractiveAllowed(program);
        let pageKey = result.pageKey;

        while (pageKey && interactive) {
          const action = await promptTokensPagination();
          if (action === "stop") {
            console.log(`\n  ${dim(`Next page key: ${pageKey}`)}`);
            break;
          }

          const nextResult = await withSpinner("Fetching next page…", "Page fetched", () =>
            client.call("alchemy_getTokenBalances", [address, "erc20", { pageKey }]),
          ) as TokenResponse;

          if (isJSONMode()) {
            printJSON(nextResult);
            return;
          }

          const nextRows = formatTokenRows(nextResult.tokenBalances);
          totalShown += nextRows.length;

          if (nextRows.length > 0) {
            printTable(["Contract", "Balance (base units)", "Raw (hex)"], nextRows);
          }
          console.log(`\n  ${dim(`${totalShown} tokens total (zero balances hidden).`)}`);

          pageKey = nextResult.pageKey;
        }

        if (pageKey && !interactive) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── tokens metadata ───────────────────────────────────────────────

  cmd
    .command("metadata <contract>")
    .description("Get ERC-20 token metadata (name, symbol, decimals, logo)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens metadata 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48`,
    )
    .action(async (contract: string) => {
      try {
        validateAddress(contract);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token metadata…", "Token metadata fetched", () =>
          client.call("alchemy_getTokenMetadata", [contract]),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── tokens allowance ──────────────────────────────────────────────

  cmd
    .command("allowance")
    .description("Get ERC-20 token allowance")
    .requiredOption("--owner <address>", "Owner address")
    .requiredOption("--spender <address>", "Spender address")
    .requiredOption("--contract <address>", "Token contract address")
    .action(async (opts: { owner: string; spender: string; contract: string }) => {
      try {
        validateAddress(opts.owner);
        validateAddress(opts.spender);
        validateAddress(opts.contract);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token allowance…", "Token allowance fetched", () =>
          client.call("alchemy_getTokenAllowance", [
            opts.owner,
            opts.spender,
            opts.contract,
          ]),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
