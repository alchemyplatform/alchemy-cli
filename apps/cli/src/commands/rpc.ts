import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { debug } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { parseCLIParams } from "../lib/params.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { registerEvmRpcSurfaceCommands } from "./surface-parity.js";

export function registerRPC(program: Command) {
  const cmd = program
    .command("rpc")
    .argument("<method>", "JSON-RPC method name (e.g. eth_blockNumber)")
    .argument("[params...]", "Method parameters as JSON values")
    .description("Make a raw JSON-RPC call")
    .addHelpText(
      "after",
      `
Examples:
  alchemy evm rpc eth_blockNumber -n eth-mainnet
  alchemy evm rpc eth_getBalance "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" "latest" -n eth-mainnet
  alchemy evm rpc eth_getBlockByNumber "0x1" true -n eth-mainnet`,
    )
    .action(async (method: string, params: string[]) => {
      try {
        if (outputRpcHelp(cmd, method, params)) {
          return;
        }

        const client = clientFromFlags(program);

        const parsed = parseRPCParams(params);

        debug(`rpc ${method} %o`, parsed);

        const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
          client.call(method, parsed),
        );

        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  registerEvmRpcSurfaceCommands(program, cmd);
}

function parseRPCParams(params: string[]): unknown[] {
  const parsed = parseCLIParams(params);
  if (parsed.length === 1 && Array.isArray(parsed[0])) {
    return parsed[0] as unknown[];
  }
  return parsed;
}

function outputRpcHelp(cmd: Command, method: string, params: string[]): boolean {
  if (method !== "help") {
    return false;
  }

  const [topic] = params;
  if (!topic) {
    cmd.outputHelp();
    return true;
  }

  const subcommand = cmd.commands.find((command) => command.name() === topic);
  if (subcommand) {
    subcommand.outputHelp();
    return true;
  }

  cmd.outputHelp();
  return true;
}
