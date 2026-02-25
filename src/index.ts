import { Command, Help } from "commander";
import { CLIError, ErrorCode } from "./lib/errors.js";
import {
  setFlags,
  printError,
  isJSONMode,
  formatCommanderError,
} from "./lib/output.js";
import { load as loadConfig } from "./lib/config.js";
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
import { registerChains } from "./commands/chains.js";
import { registerApps } from "./commands/apps.js";

// ── ANSI helpers for help formatting ────────────────────────────────
const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
const hBrand = (s: string) => `\x1b[38;2;54;63;249m${s}\x1b[39m`;
const hBold = esc("1");
const hDim = esc("2");

const program = new Command();
const argvTokens = process.argv.slice(2);
const isHelpInvocation = argvTokens.some((token) =>
  token === "help" || token === "--help" || token === "-h"
);
const findCommandByPath = (root: Command, path: string[]): Command | null => {
  let current: Command = root;

  for (const segment of path) {
    const next = current.commands.find(
      (cmd) => cmd.name() === segment || cmd.aliases().includes(segment),
    );
    if (!next) return null;
    current = next;
  }

  return current;
};

program
  .name("alchemy")
  .description(
    "The Alchemy CLI lets you query blockchain data, call JSON-RPC methods, and manage your Alchemy configuration.",
  )
  .version("0.1.0")
  .option("--api-key <key>", "Alchemy API key (env: ALCHEMY_API_KEY)")
  .option("--access-key <key>", "Alchemy access key (env: ALCHEMY_ACCESS_KEY)")
  .option(
    "-n, --network <network>",
    "Target network (default: eth-mainnet) (env: ALCHEMY_NETWORK)",
  )
  .option("--json", "Force JSON output")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("-v, --verbose", "Enable verbose output")
  .option("--debug", "Enable debug diagnostics")
  .addHelpCommand(false)
  .configureOutput({
    outputError(str, write) {
      write(formatCommanderError(str));
    },
  })
  .configureHelp({
    formatHelp(cmd, helper) {
      const defaultHelp = Help.prototype.formatHelp.call(helper, cmd, helper);
      if (isJSONMode()) return defaultHelp;

      const lines = defaultHelp.split("\n");
      let section: "usage" | "options" | "commands" | "arguments" | null = null;

      const out = lines.map((line) => {
        const sectionMatch = line.match(/^(Usage|Commands|Options|Arguments):$/);
        if (sectionMatch) {
          const title = sectionMatch[1];
          section = title.toLowerCase() as typeof section;
          return `${hBrand("◆")} ${hBold(title)}\n  ${hDim("────────────────────────────────────")}`;
        }

        // Clear section after a blank line to avoid over-styling.
        if (line.trim() === "") {
          section = null;
          return line;
        }

        // In options/commands tables, style only left and right columns.
        if (section === "options" || section === "commands") {
          const entryMatch = line.match(/^(\s+)(.+?)(\s{2,})(.+)$/);
          if (entryMatch) {
            const [, indent, left, gap, right] = entryMatch;
            return `${indent}${hBrand(left)}${gap}${hDim(right)}`;
          }
        }

        return line;
      });

      return out.join("\n") + "\n";
    },
  })
  .addHelpText("beforeAll", () => (isHelpInvocation ? brandedHelp() : ""))
  .hook("preAction", () => {
    const opts = program.opts();
    const cfg = loadConfig();
    setFlags({
      json: opts.json,
      quiet: opts.quiet,
      verbose: Boolean(opts.verbose || cfg.verbose),
      debug: Boolean(opts.debug),
    });
  })
  .hook("postAction", () => {
    if (!isJSONMode()) {
      console.log("");
    }
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
registerChains(program);
registerApps(program);
registerVersion(program);
program
  .command("help [command...]")
  .description("display help for command")
  .action((commandPath?: string[]) => {
    if (!commandPath || commandPath.length === 0) {
      program.outputHelp();
      return;
    }

    const target = findCommandByPath(program, commandPath);
    if (!target) {
      program.error(`unknown command '${commandPath.join(" ")}'`);
      return;
    }

    target.outputHelp();
  });

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
