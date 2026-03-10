import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { parseRequiredJSON } from "../lib/params.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";

async function runBundlerMethod(
  program: Command,
  method: string,
  params: unknown[],
): Promise<void> {
  const client = clientFromFlags(program);
  const result = await withSpinner(`Calling ${method}…`, `Called ${method}`, () =>
    client.call(method, params),
  );
  printSyntaxJSON(result);
}

export function registerBundler(program: Command) {
  const cmd = program.command("bundler").description("Wallet Bundler API wrappers");

  cmd
    .command("send-user-operation")
    .description("Call eth_sendUserOperation")
    .requiredOption("--user-op <json>", "UserOperation JSON")
    .requiredOption("--entry-point <address>", "EntryPoint address")
    .action(async (opts: { userOp: string; entryPoint: string }) => {
      try {
        await runBundlerMethod(program, "eth_sendUserOperation", [
          parseRequiredJSON(opts.userOp, "--user-op"),
          opts.entryPoint,
        ]);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("estimate-user-operation-gas")
    .description("Call eth_estimateUserOperationGas")
    .requiredOption("--user-op <json>", "UserOperation JSON")
    .requiredOption("--entry-point <address>", "EntryPoint address")
    .option("--state-override <json>", "State override set JSON")
    .action(
      async (opts: {
        userOp: string;
        entryPoint: string;
        stateOverride?: string;
      }) => {
        try {
          const params: unknown[] = [
            parseRequiredJSON(opts.userOp, "--user-op"),
            opts.entryPoint,
          ];
          if (opts.stateOverride) {
            params.push(parseRequiredJSON(opts.stateOverride, "--state-override"));
          }
          await runBundlerMethod(program, "eth_estimateUserOperationGas", params);
        } catch (err) {
          exitWithError(err);
        }
      },
    );

  cmd
    .command("get-user-operation-receipt")
    .description("Call eth_getUserOperationReceipt")
    .requiredOption("--user-op-hash <hash>", "User operation hash")
    .action(async (opts: { userOpHash: string }) => {
      try {
        await runBundlerMethod(program, "eth_getUserOperationReceipt", [opts.userOpHash]);
      } catch (err) {
        exitWithError(err);
      }
    });
}
