import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { parseRequiredJSON } from "../lib/params.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";

async function runGasMethod(
  program: Command,
  method: string,
  payload: unknown,
): Promise<void> {
  const client = clientFromFlags(program);
  const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
    client.call(method, [payload]),
  );
  printSyntaxJSON(result);
}

export function registerGasManager(program: Command) {
  const cmd = program.command("gas-manager").description("Gas Manager API wrappers");

  cmd
    .command("request-gas-and-paymaster")
    .description("Call alchemy_requestGasAndPaymasterAndData")
    .requiredOption("--body <json>", "Request payload JSON")
    .action(async (opts: { body: string }) => {
      try {
        await runGasMethod(
          program,
          "alchemy_requestGasAndPaymasterAndData",
          parseRequiredJSON(opts.body, "--body"),
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("request-paymaster-token-quote")
    .description("Call alchemy_requestPaymasterTokenQuote")
    .requiredOption("--body <json>", "Request payload JSON")
    .action(async (opts: { body: string }) => {
      try {
        await runGasMethod(
          program,
          "alchemy_requestPaymasterTokenQuote",
          parseRequiredJSON(opts.body, "--body"),
        );
      } catch (err) {
        exitWithError(err);
      }
    });
}
