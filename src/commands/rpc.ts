import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { isJSONMode, debug } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { withSpinner } from "../lib/ui.js";

export function registerRPC(program: Command) {
  program
    .command("rpc <method> [params...]")
    .description("Make a raw JSON-RPC call")
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

        if (isJSONMode()) {
          console.log(JSON.stringify(result));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
