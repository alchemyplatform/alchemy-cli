import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable, emptyState, printKeyValueBox, printSyntaxJSON } from "../lib/ui.js";
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
  const cmd = program
    .command("tokens")
    .description("Token API wrappers")
    .argument("[address]", "Wallet address (default action: list balances)")
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy tokens metadata 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48
  alchemy tokens allowance --owner 0x... --spender 0x... --contract 0x...
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy tokens`,
    )
    .action(async (addressArg: string | undefined, opts: { pageKey?: string }) => {
      try {
        const address = addressArg ?? (await readStdinArg("address"));
        validateAddress(address);

        const params: unknown[] = [address];
        if (opts.pageKey) {
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
          let decimalBalance = dim("unparseable");
          try {
            decimalBalance = BigInt(tb.tokenBalance).toString();
          } catch {
            // Keep fallback when provider returns unexpected non-hex content.
          }
          return [tb.contractAddress, decimalBalance, tb.tokenBalance];
        });

        printKeyValueBox([
          ["Address", address],
          ["Network", client.network],
          ["Non-zero tokens", String(nonZero.length)],
        ]);
        printTable(["Contract", "Balance (base units)", "Raw (hex)"], rows);
        console.log(`\n  ${dim(`Showing ${nonZero.length} of ${result.tokenBalances.length} contracts (non-zero only).`)}`);

        if (verbose) {
          console.log("");
          printJSON(result);
        }

        if (result.pageKey) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${result.pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("metadata <contract>")
    .description("Get ERC-20 token metadata")
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
