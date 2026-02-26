import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { dim, withSpinner, printTable, emptyState } from "../lib/ui.js";
import { validateAddress, readStdinArg } from "../lib/validators.js";

interface TokenResponse {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
  }>;
  pageKey?: string;
}

export function registerTokens(program: Command) {
  program
    .command("tokens [address]")
    .description("List ERC-20 token balances for an address")
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy tokens`,
    )
    .action(async (addressArg: string | undefined, opts: { pageKey?: string }) => {
      try {
        const address = addressArg ?? readStdinArg("address");
        validateAddress(address);

        const params: unknown[] = [address];
        if (opts.pageKey) {
          // alchemy_getTokenBalances accepts [address, "DEFAULT_TOKENS" | "erc20", { pageKey }]
          params.push("erc20", { pageKey: opts.pageKey });
        }

        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token balances…", "Token balances fetched", () =>
          client.call("alchemy_getTokenBalances", params),
        ) as TokenResponse;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        const nonZero = result.tokenBalances.filter(
          (tb) =>
            tb.tokenBalance !== "0x0" &&
            tb.tokenBalance !==
              "0x0000000000000000000000000000000000000000000000000000000000000000",
        );

        if (nonZero.length === 0) {
          emptyState("No token balances found.");
          return;
        }

        const rows = nonZero.map((tb) => {
          const display =
            tb.tokenBalance.length > 20
              ? tb.tokenBalance.slice(0, 20) + "…"
              : tb.tokenBalance;
          return [tb.contractAddress, display];
        });

        printTable(["Contract", "Balance"], rows);

        if (result.pageKey) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${result.pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
