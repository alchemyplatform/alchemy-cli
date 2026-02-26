import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { withSpinner, printTable, emptyState } from "../lib/ui.js";
import { validateAddress, readStdinArg } from "../lib/validators.js";

interface TokenResponse {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
  }>;
}

export function registerTokens(program: Command) {
  program
    .command("tokens [address]")
    .description("List ERC-20 token balances for an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy tokens`,
    )
    .action(async (addressArg?: string) => {
      try {
        const address = addressArg ?? readStdinArg("address");
        validateAddress(address);

        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token balances…", "Token balances fetched", () =>
          client.call("alchemy_getTokenBalances", [address]),
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
      } catch (err) {
        exitWithError(err);
      }
    });
}
