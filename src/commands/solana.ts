import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { parseCLIParams } from "../lib/params.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";

export function registerSolana(program: Command) {
  const cmd = program.command("solana").description("Solana RPC and DAS wrappers");

  cmd
    .command("rpc <method> [params...]")
    .description("Call a Solana JSON-RPC method")
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program, { defaultNetwork: "solana-mainnet" });
        const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
          client.call(method, parseCLIParams(params)),
        );
        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("das <method> [params...]")
    .description("Call a Solana DAS method (e.g. getAssetsByOwner)")
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program, { defaultNetwork: "solana-mainnet" });
        // DAS methods use named params (object), not positional (array).
        // If the user passes a single JSON object, send it directly as params.
        const parsed = parseCLIParams(params);
        const rpcParams = parsed.length === 1 && typeof parsed[0] === "object" && parsed[0] !== null && !Array.isArray(parsed[0])
          ? (parsed[0] as Record<string, unknown>)
          : parsed;
        const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
          client.call(method, rpcParams),
        );
        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
