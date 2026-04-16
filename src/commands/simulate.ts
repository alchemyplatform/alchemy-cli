import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { exitWithError } from "../lib/errors.js";
import { parseRequiredJSON } from "../lib/params.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";

interface SimulateCallOptions {
  method: string;
  params: unknown[];
}

async function runSimulateCall(
  program: Command,
  options: SimulateCallOptions,
): Promise<void> {
  const client = clientFromFlags(program);
  const result = await withSpinner(`Calling ${options.method}…`, `Called ${options.method}`, () =>
    client.call(options.method, options.params),
  );
  printSyntaxJSON(result);
}

export function registerSimulate(program: Command) {
  const cmd = program.command("simulate").description("Simulation API wrappers");

  cmd
    .command("asset-changes")
    .description("Simulates a transaction and returns a human-readable breakdown of asset changes (token transfers, ETH movements, NFT transfers) before it is broadcast. Use to preview what a transaction will do. For raw JSON-RPC calls, use `alchemy rpc` instead.")
    .requiredOption("--tx <json>", "Transaction object JSON")
    .option("--block-tag <tag>", "Block tag (default latest)", "latest")
    .action(async (opts: { tx: string; blockTag: string }) => {
      try {
        await runSimulateCall(program, {
          method: "alchemy_simulateAssetChanges",
          params: [parseRequiredJSON(opts.tx, "--tx"), opts.blockTag],
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("execution")
    .description("Call alchemy_simulateExecution")
    .requiredOption("--tx <json>", "Transaction object JSON")
    .option("--block-tag <tag>", "Block tag (default latest)", "latest")
    .action(async (opts: { tx: string; blockTag: string }) => {
      try {
        await runSimulateCall(program, {
          method: "alchemy_simulateExecution",
          params: [parseRequiredJSON(opts.tx, "--tx"), opts.blockTag],
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("asset-changes-bundle")
    .description("Call alchemy_simulateAssetChangesBundle")
    .requiredOption("--txs <json>", "JSON array of tx objects")
    .option("--block-tag <tag>", "Block tag (default latest)", "latest")
    .action(async (opts: { txs: string; blockTag: string }) => {
      try {
        await runSimulateCall(program, {
          method: "alchemy_simulateAssetChangesBundle",
          params: [parseRequiredJSON(opts.txs, "--txs"), opts.blockTag],
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("execution-bundle")
    .description("Call alchemy_simulateExecutionBundle")
    .requiredOption("--txs <json>", "JSON array of tx objects")
    .option("--block-tag <tag>", "Block tag (default latest)", "latest")
    .action(async (opts: { txs: string; blockTag: string }) => {
      try {
        await runSimulateCall(program, {
          method: "alchemy_simulateExecutionBundle",
          params: [parseRequiredJSON(opts.txs, "--txs"), opts.blockTag],
        });
      } catch (err) {
        exitWithError(err);
      }
    });
}
