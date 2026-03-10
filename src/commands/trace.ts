import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";
import { parseCLIParams } from "../lib/params.js";

function normalizeTraceMethod(method: string): string {
  if (method.startsWith("trace_")) return method;
  const normalized = method.replace(/-/g, "_").toLowerCase();
  if (normalized === "tx" || normalized === "transaction") {
    return "trace_transaction";
  }
  return `trace_${normalized}`;
}

export function registerTrace(program: Command) {
  program
    .command("trace <method> [params...]")
    .description("Call a trace_* method")
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program);
        const rpcMethod = normalizeTraceMethod(method);
        const result = await withSpinner(`Calling ${rpcMethod}…`, `Called ${rpcMethod}`, () =>
          client.call(rpcMethod, parseCLIParams(params)),
        );
        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
