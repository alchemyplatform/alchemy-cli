import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";

interface TokenResponse {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
  }>;
}

export function registerTokens(program: Command) {
  program
    .command("tokens <address>")
    .description("List ERC-20 token balances for an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
    )
    .action(async (address: string) => {
      try {
        if (!address.startsWith("0x")) {
          throw errInvalidArgs("address must start with 0x");
        }

        const client = clientFromFlags(program);
        const result = (await client.call("alchemy_getTokenBalances", [
          address,
        ])) as TokenResponse;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        console.log(`Token balances for ${address}\n`);
        let nonZero = 0;
        for (const tb of result.tokenBalances) {
          if (
            tb.tokenBalance === "0x0" ||
            tb.tokenBalance ===
              "0x0000000000000000000000000000000000000000000000000000000000000000"
          )
            continue;
          nonZero++;
          const display =
            tb.tokenBalance.length > 20
              ? tb.tokenBalance.slice(0, 20) + "..."
              : tb.tokenBalance;
          console.log(`  ${tb.contractAddress}: ${display}`);
        }
        if (nonZero === 0) {
          console.log("  No token balances found.");
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
