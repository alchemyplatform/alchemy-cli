import { Command } from "commander";
import { clientFromFlags, resolveSolanaNetwork } from "../lib/resolve.js";
import { errInvalidArgs, exitWithError } from "../lib/errors.js";
import { parseCLIParams } from "../lib/params.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";
import { registerNetwork } from "./network.js";
import { registerSolanaDelegate } from "./solana-delegate.js";
import { registerSolanaProgram } from "./solana-program.js";
import { registerSolanaSend } from "./send-solana.js";
import { registerStatus } from "./status.js";

function registerReservedSolanaCommand(args: {
  cmd: Command;
  signature: string;
  description: string;
  displayName: string;
}) {
  args.cmd
    .command(args.signature)
    .description(args.description)
    .action(() => {
      exitWithError(
        errInvalidArgs(
          `alchemy solana ${args.displayName} is reserved for the v1 Solana surface and is not implemented yet.`,
        ),
      );
    });
}

function registerReservedSolanaCommands(cmd: Command) {
  registerReservedSolanaCommand({
    cmd,
    signature: "swap",
    displayName: "swap",
    description: "Swap tokens on Solana",
  });
}

export function registerSolana(program: Command) {
  const cmd = program.command("solana").description("Solana RPC and DAS wrappers");

  cmd
    .command("rpc <method> [params...]")
    .description("Call a Solana JSON-RPC method")
    .action(async (method: string, params: string[]) => {
      try {
        const client = clientFromFlags(program, {
          forceNetwork: resolveSolanaNetwork(program),
        });
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
        const client = clientFromFlags(program, {
          forceNetwork: resolveSolanaNetwork(program),
        });
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

  registerNetwork(cmd);
  registerSolanaSend(cmd);
  registerSolanaProgram(cmd);
  registerSolanaDelegate(cmd);
  registerStatus(cmd, { networkMode: "solana" });
  registerReservedSolanaCommands(cmd);
}
