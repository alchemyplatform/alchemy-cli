import { Command } from "commander";
import { CLIError, ErrorCode } from "./lib/errors.js";
import { setFlags, printError } from "./lib/output.js";
import { brandedHelp } from "./lib/ui.js";
import { registerConfig } from "./commands/config.js";
import { registerRPC } from "./commands/rpc.js";
import { registerBalance } from "./commands/balance.js";
import { registerTx } from "./commands/tx.js";
import { registerBlock } from "./commands/block.js";
import { registerNFTs } from "./commands/nfts.js";
import { registerTokens } from "./commands/tokens.js";
import { registerNetwork } from "./commands/network.js";
import { registerVersion } from "./commands/version.js";

const program = new Command();

program
  .name("alchemy")
  .description(
    "The Alchemy CLI lets you query blockchain data, call JSON-RPC methods, and manage your Alchemy configuration.",
  )
  .version("0.1.0")
  .option("--api-key <key>", "Alchemy API key (env: ALCHEMY_API_KEY)")
  .option(
    "-n, --network <network>",
    "Target network (default: eth-mainnet) (env: ALCHEMY_NETWORK)",
  )
  .option("--json", "Force JSON output")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("-v, --verbose", "Enable debug output")
  .addHelpText("beforeAll", brandedHelp())
  .hook("preAction", () => {
    const opts = program.opts();
    setFlags({
      json: opts.json,
      quiet: opts.quiet,
      verbose: opts.verbose,
    });
  })
  .action(async () => {
    if (process.stdin.isTTY) {
      const { startREPL } = await import("./commands/interactive.js");
      // In REPL mode, override exitOverride so errors don't kill the process
      program.exitOverride();
      program.configureOutput({
        writeErr: () => {},
      });
      await startREPL(program);
    } else {
      program.help();
    }
  });

registerConfig(program);
registerRPC(program);
registerBalance(program);
registerTx(program);
registerBlock(program);
registerNFTs(program);
registerTokens(program);
registerNetwork(program);
registerVersion(program);

export function exitWithError(err: unknown): never {
  if (err instanceof CLIError) {
    printError(err);
  } else {
    printError(
      new CLIError(
        ErrorCode.INTERNAL_ERROR,
        err instanceof Error ? err.message : String(err),
      ),
    );
  }
  process.exit(1);
}

program.parse();
