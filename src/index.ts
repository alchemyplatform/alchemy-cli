import { Command, Help } from "commander";
import { CLIError, ErrorCode } from "./lib/errors.js";
import { setFlags, printError, isJSONMode } from "./lib/output.js";
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

// ── ANSI helpers for help formatting ────────────────────────────────
const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
const hBrand = (s: string) => `\x1b[38;2;54;63;249m${s}\x1b[39m`;
const hBold = esc("1");
const hDim = esc("2");

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
  .configureHelp({
    formatHelp(cmd, helper) {
      const defaultHelp = Help.prototype.formatHelp.call(helper, cmd, helper);
      if (isJSONMode()) return defaultHelp;

      return defaultHelp
        // Style section headers: "Commands:", "Options:", "Usage:", "Arguments:"
        .replace(/^(Usage|Commands|Options|Arguments):/gm, (_, title) =>
          `${hBrand("◆")} ${hBold(title)}\n  ${hDim("────────────────────────────────────")}`)
        // Style command entries: "  commandName   description"
        .replace(/^( {2})(\w[\w-]*)( +)(.+)$/gm, (_, indent, name, space, desc) =>
          `${indent}${hBrand(name)}${space}${hDim(desc)}`)
        // Style option flags
        .replace(/^( +)(-[\w, -]+<?\w*>?)( +)(.+)$/gm, (_, indent, flags, space, desc) =>
          `${indent}${hBrand(flags)}${space}${hDim(desc)}`);
    },
  })
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
