import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errInvalidArgs } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { brand, dim, green, withSpinner, weiToEth } from "../lib/ui.js";

export function registerBalance(program: Command) {
  program
    .command("balance <address>")
    .description("Get the ETH balance of an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n polygon-mainnet`,
    )
    .action(async (address: string) => {
      try {
        if (!address.startsWith("0x")) {
          throw errInvalidArgs("address must start with 0x");
        }

        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching balance…", "Balance fetched", () =>
          client.call("eth_getBalance", [address, "latest"]),
        ) as string;

        const wei = BigInt(result);
        const network = resolveNetwork(program);

        if (isJSONMode()) {
          printJSON({
            address,
            wei: wei.toString(),
            eth: weiToEth(wei),
            network,
          });
        } else {
          console.log(`${dim("Address:")} ${brand(address)}`);
          console.log(`${dim("Balance:")} ${green(weiToEth(wei) + " ETH")}`);
          console.log(`${dim("Network:")} ${network}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
