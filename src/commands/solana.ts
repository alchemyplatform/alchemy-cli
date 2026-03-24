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

  const das = cmd.command("das").description("Solana DAS (Digital Asset Standard) wrappers");

  das
    .command("<method> [params...]")
    .description("Call DAS method (e.g. getAssetsByOwner)")
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
}
