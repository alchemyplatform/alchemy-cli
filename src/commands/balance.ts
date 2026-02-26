import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { green, withSpinner, weiToEth, printKeyValueBox } from "../lib/ui.js";
import { validateAddress, readStdinArg } from "../lib/validators.js";

export function registerBalance(program: Command) {
  program
    .command("balance [address]")
    .description("Get the ETH balance of an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n polygon-mainnet
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy balance`,
    )
    .action(async (addressArg?: string) => {
      try {
        const address = addressArg ?? (await readStdinArg("address"));
        validateAddress(address);

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
          printKeyValueBox([
            ["Address", address],
            ["Balance", green(weiToEth(wei) + " ETH")],
            ["Network", network],
          ]);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
