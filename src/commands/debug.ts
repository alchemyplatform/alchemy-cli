import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { parseCLIParams } from "../lib/params.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";

function normalizeDebugMethod(method: string): string {
  if (method.startsWith("debug_")) return method;
  return `debug_${method.replace(/-/g, "_")}`;
}

export function registerDebug(program: Command) {
  program
    .command("debug")
    .argument("<method>", "Debug method name (e.g. debug_traceTransaction)")
    .argument("[params...]", "Method parameters as JSON values")
    .description("Call a debug_* method")
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program);
        const rpcMethod = normalizeDebugMethod(method);
        const result = await withSpinner(`Calling ${rpcMethod}…`, `Called ${rpcMethod}`, () =>
          client.call(rpcMethod, parseCLIParams(params)),
        );
        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
