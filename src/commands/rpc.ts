import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { isJSONMode, debug } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";

export function registerRPC(program: Command) {
  program
    .command("rpc")
    .argument("<method>", "JSON-RPC method name (e.g. eth_blockNumber)")
    .argument("[params...]", "Method parameters as JSON values")
    .description("Sends a raw JSON-RPC request to an Alchemy node (e.g. eth_call, eth_getCode, eth_blockNumber). Use for low-level RPC calls only. For higher-level operations like balances, transfers, simulation, or token data, use the dedicated subcommands instead.")
    .addHelpText(
      "after",
      `
Examples:
  alchemy rpc eth_blockNumber
  alchemy rpc eth_getBalance "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" "latest"
  alchemy rpc eth_getBlockByNumber "0x1" true`,
    )
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program);

        const parsed = params.map((p) => {
          try {
            return JSON.parse(p);
          } catch {
            return p;
          }
        });

        debug(`rpc ${method} %o`, parsed);

        const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
          client.call(method, parsed),
        );

        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
