import { Command, Help } from "commander";
import { EXIT_CODES, errInvalidArgs, errSetupRequired, exitWithError } from "./lib/errors.js";
import { setFlags, isJSONMode, quiet } from "./lib/output.js";
import { formatCommanderError } from "./lib/error-format.js";
import { load as loadConfig } from "./lib/config.js";
import { brandedHelp } from "./lib/ui.js";
import { noColor, setNoColor, identity, esc } from "./lib/colors.js";
import { registerConfig } from "./commands/config.js";
import { registerRPC } from "./commands/rpc.js";
import { registerBalance } from "./commands/balance.js";
import { registerTx } from "./commands/tx.js";
import { registerReceipt } from "./commands/receipt.js";
import { registerBlock } from "./commands/block.js";
import { registerNFTs } from "./commands/nfts.js";
import { registerTokens } from "./commands/tokens.js";
import { registerNetwork } from "./commands/network.js";
import { registerVersion } from "./commands/version.js";
import { registerApps } from "./commands/apps.js";
import { registerWallet } from "./commands/wallet.js";
import { registerSetup } from "./commands/setup.js";
import { registerAuth } from "./commands/auth.js";
import { registerTrace } from "./commands/trace.js";
import { registerDebug } from "./commands/debug.js";
import { registerTransfers } from "./commands/transfers.js";
import { registerPrices } from "./commands/prices.js";
import { registerPortfolio } from "./commands/portfolio.js";
import { registerSimulate } from "./commands/simulate.js";
import { registerWebhooks } from "./commands/webhooks.js";
import { registerBundler } from "./commands/bundler.js";
import { registerGasManager } from "./commands/gas-manager.js";
import { registerSolana } from "./commands/solana.js";
import { registerGas } from "./commands/gas.js";
import { registerLogs } from "./commands/logs.js";
import { registerCompletions } from "./commands/completions.js";
import { registerSend } from "./commands/send/index.js";
import { registerContract } from "./commands/contract.js";
import { registerAgentPrompt } from "./commands/agent-prompt.js";
import { registerUpdateCheck } from "./commands/update-check.js";
import { isInteractiveAllowed } from "./lib/interaction.js";
import { getSetupStatus, isSetupComplete, shouldRunOnboarding } from "./lib/onboarding.js";
import { getAvailableUpdate, printUpdateNotice } from "./lib/update-check.js";

// ── ANSI helpers for help formatting ────────────────────────────────
const hBrand = noColor
  ? identity
  : (s: string) => `\x1b[38;2;54;63;249m${s}\x1b[39m`;
const hBold = esc("1");
const hDim = esc("2");
const ROOT_OPTION_GROUPS = [
  {
    label: "Auth & Network",
    matchers: ["--api-key", "--access-key", "--network", "--x402", "--wallet-key-file", "--solana-wallet-key-file", "--gas-sponsored", "--gas-policy-id"],
  },
  {
    label: "Output & Formatting",
    matchers: ["--json", "--quiet", "--verbose", "--no-color", "--reveal"],
  },
  {
    label: "Runtime & Behavior",
    matchers: ["--timeout", "--debug", "--no-interactive"],
  },
] as const;

const ROOT_COMMAND_PILLARS = [
  {
    label: "Node",
    commands: ["balance", "tx", "block", "rpc", "trace", "debug", "gas", "logs"],
  },
  {
    label: "Data",
    commands: ["tokens", "nfts", "transfers", "prices", "portfolio", "simulate"],
  },
  {
    label: "Execution",
    commands: ["send", "contract"],
  },
  {
    label: "Wallets",
    commands: ["wallet", "bundler", "gas-manager", "webhooks"],
  },
  {
    label: "Chains",
    commands: ["network", "solana"],
  },
  {
    label: "Admin",
    commands: ["apps", "auth", "config", "setup", "completions", "agent-prompt", "update-check", "version", "help"],
  },
] as const;

function formatCommandSignature(sub: Command): string {
  const args = sub.registeredArguments.map((arg) => {
    const variadic = (arg as { variadic?: boolean }).variadic === true;
    const name = variadic ? `${arg.name()}...` : arg.name();
    return arg.required ? `<${name}>` : `[${name}]`;
  });
  return [sub.name(), ...args].join(" ");
}

function rootOptionGroupLabel(flags: string): string {
  for (const group of ROOT_OPTION_GROUPS) {
    if (group.matchers.some((matcher) => flags.includes(matcher))) {
      return group.label;
    }
  }
  return "General";
}

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

declare const __CLI_VERSION__: string;

let cachedAvailableUpdate: string | null | undefined;
let updateShownDuringInteractiveStartup = false;

function getAvailableUpdateOnce(): string | null {
  if (cachedAvailableUpdate === undefined) {
    cachedAvailableUpdate = getAvailableUpdate();
  }
  return cachedAvailableUpdate;
}

function resetUpdateNoticeState(): void {
  cachedAvailableUpdate = undefined;
  updateShownDuringInteractiveStartup = false;
}

program
  .name("alchemy")
  .description(
    "The Alchemy CLI lets you query blockchain data, call JSON-RPC methods, and manage your Alchemy configuration.",
  )
  .version(__CLI_VERSION__, "-v, --version", "display CLI version")
  .option("--api-key <key>", "Alchemy API key (env: ALCHEMY_API_KEY)")
  .option("--access-key <key>", "Alchemy access key (env: ALCHEMY_ACCESS_KEY)")
  .option(
    "-n, --network <network>",
    "Target network (default: eth-mainnet) (env: ALCHEMY_NETWORK)",
  )
  .option("--x402", "Use x402 wallet-based gateway auth")
  .option("--wallet-key-file <path>", "Path to wallet private key file for x402")
  .option("--solana-wallet-key-file <path>", "Path to Solana wallet private key file")
  .option("--gas-sponsored", "Enable gas sponsorship (env: ALCHEMY_GAS_SPONSORED)")
  .option("--gas-policy-id <id>", "Gas policy ID for sponsorship (env: ALCHEMY_GAS_POLICY_ID)")
  .option("--json", "Force JSON output (auto-enabled when piped)")
  .option("-q, --quiet", "Suppress non-essential output")
  .option("--verbose", "Enable verbose output")
  .option("--no-color", "Disable color output")
  .option("--reveal", "Show secrets in plain text")
  .option("--timeout <ms>", "Request timeout in milliseconds (default: none)", parseInt)
  .option("--debug", "Enable debug diagnostics")
  .option("--no-interactive", "Disable REPL and prompt-driven interactions")
  .addHelpCommand(false)
  .allowExcessArguments(true)
  .exitOverride((err) => {
    if (
      err.code === "commander.help" ||
      err.code === "commander.helpDisplayed" ||
      err.code === "commander.version"
    ) {
      process.exit(0);
    }
    process.exit(EXIT_CODES.INVALID_ARGS);
  })
  .configureOutput({
    outputError(str, write) {
      write(formatCommanderError(str));
    },
  })
  .configureHelp({
    formatHelp(cmd, helper) {
      const defaultHelp = Help.prototype.formatHelp.call(helper, cmd, helper);

      if (isJSONMode()) {
        const schema: Record<string, unknown> = {
          name: cmd.name(),
          description: cmd.description(),
        };

        const args = cmd.registeredArguments;
        if (args.length > 0) {
          schema.arguments = args.map((a) => ({
            name: a.name(),
            description: a.description,
            required: a.required,
          }));
        }

        const opts = cmd.options;
        if (opts.length > 0) {
          schema.options = opts.map((o) => ({
            flags: o.flags,
            description: o.description,
          }));
        }

        const subs = cmd.commands;
        if (subs.length > 0) {
          schema.subcommands = subs.map((s) => ({
            name: s.name(),
            description: s.description(),
          }));
        }

        return JSON.stringify(schema, null, 2) + "\n";
      }

      const lines = defaultHelp.split("\n");
      let section: "usage" | "options" | "commands" | "arguments" | null = null;
      const emittedOptionGroups = new Set<string>();

      const out = lines
        .map((line): string | null => {
        const sectionMatch = line.match(/^(Usage|Commands|Options|Arguments):$/);
        if (sectionMatch) {
          const title = sectionMatch[1];
          if (title === "Commands" && cmd === program) {
            section = "commands";
            const byName = new Map(
              cmd.commands.map((sub) => [sub.name(), sub]),
            );
            const groupedRows = ROOT_COMMAND_PILLARS.map((pillar) => {
              const rows = pillar.commands
                .map((name) => byName.get(name))
                .filter((sub): sub is Command => Boolean(sub))
                .map((sub) => ({
                  left: formatCommandSignature(sub),
                  right: sub.description(),
                }));
              return { label: pillar.label, rows };
            }).filter((group) => group.rows.length > 0);

            const maxLeft = Math.max(
              0,
              ...groupedRows.flatMap((group) => group.rows.map((row) => row.left.length)),
            );
            const groupText = groupedRows.map((group) => {
              const header = `  ${hBold(group.label)}${hDim(":")}`;
              const rows = group.rows.map((row) => {
                const gap = " ".repeat(Math.max(2, maxLeft - row.left.length + 2));
                return `    ${hBrand(row.left)}${gap}${hDim(row.right)}`;
              }).join("\n");
              return `${header}\n${rows}`;
            }).join("\n\n");

            return `${hBrand("◆")} ${hBold("Commands")}\n  ${hDim("────────────────────────────────────")}\n${groupText}`;
          }
          section = title.toLowerCase() as typeof section;
          return `${hBrand("◆")} ${hBold(title)}\n  ${hDim("────────────────────────────────────")}`;
        }

        // Clear section after a blank line to avoid over-styling.
        if (line.trim() === "") {
          section = null;
          return line;
        }

        // Root help replaces "Commands" with grouped command pillars.
        if (section === "commands" && cmd === program) {
          return null;
        }

        // In options/commands tables, style only left and right columns.
        if (section === "options" || section === "commands") {
          const entryMatch = line.match(/^(\s+)(.+?)(\s{2,})(.+)$/);
          if (entryMatch) {
            const [, indent, left, gap, right] = entryMatch;
            const styledLine = `${indent}${hBrand(left)}${gap}${hDim(right)}`;
            if (section === "options" && cmd === program) {
              const groupLabel = rootOptionGroupLabel(left);
              if (!emittedOptionGroups.has(groupLabel)) {
                emittedOptionGroups.add(groupLabel);
                const needsLeadingGap = emittedOptionGroups.size > 1;
                const groupHeader = `${indent}${hBold(groupLabel)}${hDim(":")}`;
                return `${needsLeadingGap ? "\n" : ""}${groupHeader}\n${styledLine}`;
              }
            }
            return styledLine;
          }
        }

        return line;
      })
        .filter((line): line is string => line !== null);

      return out.join("\n") + "\n";
    },
  })
  .addHelpText("beforeAll", () => (isHelpInvocation ? brandedHelp() : ""))
  .addHelpText("after", () => {
    if (isJSONMode()) return "";
    return [
      "",
      `${hBrand("◆")} ${hBold("Quick Start")}`,
      `  ${hDim("────────────────────────────────────")}`,
      `  ${hBrand("alchemy")}                              ${hDim("Interactive mode with guided setup")}`,
      `  ${hBrand("alchemy balance")} ${hDim("<address>")}             ${hDim("Get native token balance")}`,
      `  ${hBrand("alchemy block latest")}                  ${hDim("Latest block summary")}`,
      `  ${hBrand("alchemy rpc eth_chainId")}               ${hDim("Raw JSON-RPC call")}`,
      `  ${hBrand("alchemy config list")}                   ${hDim("View current configuration")}`,
      "",
      `${hBrand("◆")} ${hBold("Exit Codes")}`,
      `  ${hDim("────────────────────────────────────")}`,
      `  ${hBrand("0")}     Success`,
      `  ${hBrand("1")}     Internal error`,
      `  ${hBrand("2")}     Invalid arguments`,
      `  ${hBrand("3")}     Authentication required`,
      `  ${hBrand("4")}     Not found`,
      `  ${hBrand("5")}     Rate limited`,
      `  ${hBrand("6")}     Network error`,
      `  ${hBrand("7")}     RPC error`,
      `  ${hBrand("8")}     Admin API error`,
      `  ${hBrand("9")}     Payment required`,
      `  ${hBrand("130")}   Interrupted (SIGINT)`,
      "",
      `${hBrand("◆")} ${hBold("Resources")}`,
      `  ${hDim("────────────────────────────────────")}`,
      `  ${hDim("Docs:")} ${hBrand("https://www.alchemy.com/docs")}`,
    ].join("\n");
  })
  .hook("preAction", async (thisCommand, actionCommand) => {
    const opts = program.opts();
    if (opts.color === false) setNoColor(true);
    const cfg = loadConfig();
    setFlags({
      json: opts.json,
      quiet: opts.quiet,
      verbose: Boolean(opts.verbose || cfg.verbose),
      debug: Boolean(opts.debug),
      reveal: Boolean(opts.reveal),
      timeout: opts.timeout,
    });

    // If we have an auth token but no API key, prompt for app selection
    // before running commands that need one (skip for auth/config/setup/help/etc.)
    const cmdName = actionCommand.name();
    const skipAppPrompt = [
      "auth", "config", "setup", "help", "version",
      "completions", "agent-prompt", "update-check", "wallet",
    ];
    if (
      !skipAppPrompt.includes(cmdName) &&
      isInteractiveAllowed(program) &&
      !opts.apiKey &&
      !process.env.ALCHEMY_API_KEY
    ) {
      const { resolveAuthToken } = await import("./lib/resolve.js");
      const authToken = resolveAuthToken(cfg);
      const hasApiKey = Boolean(cfg.api_key?.trim() || cfg.app?.apiKey);
      if (authToken && !hasApiKey) {
        const { selectAppAfterAuth } = await import("./commands/auth.js");
        console.log("");
        console.log(`  No app selected. Please select an app to continue.`);
        await selectAppAfterAuth(authToken);
      }
    }
  })
  .hook("postAction", () => {
    if (!isJSONMode() && !quiet) {
      console.log("");
      if (!updateShownDuringInteractiveStartup) {
        const latest = getAvailableUpdateOnce();
        if (latest) printUpdateNotice(latest);
      }
    }
    resetUpdateNoticeState();
  })
  .action(async (_opts: unknown, cmd: Command) => {
    // Commander routes here when no subcommand matches. If the user passed
    // positional args (e.g. "alchemy abcd"), those are unknown commands.
    const excessArgs = cmd.args;
    if (excessArgs.length > 0) {
      exitWithError(
        errInvalidArgs(
          `Unknown command '${excessArgs[0]}'. Run 'alchemy help' for available commands.`,
        ),
      );
    }

    const cfg = loadConfig();
    if (!isSetupComplete(cfg) && !isInteractiveAllowed(program)) {
      throw errSetupRequired(getSetupStatus(cfg));
    }

    if (isInteractiveAllowed(program)) {
      let latestForInteractiveStartup: string | null = null;
      if (shouldRunOnboarding(program, cfg)) {
        const { runOnboarding } = await import("./commands/onboarding.js");
        const latest = getAvailableUpdateOnce();
        const completed = await runOnboarding(program, latest);
        updateShownDuringInteractiveStartup = Boolean(latest);
        latestForInteractiveStartup = null;
        if (!completed) {
          // User skipped or aborted onboarding while setup remains incomplete.
          // Do not enter REPL; return to shell without forcing interactive mode.
          return;
        }
      } else {
        latestForInteractiveStartup = getAvailableUpdateOnce();
        updateShownDuringInteractiveStartup = Boolean(latestForInteractiveStartup);
      }
      const { startREPL } = await import("./commands/interactive.js");
      // In REPL mode, override exitOverride so errors don't kill the process
      program.exitOverride();
      program.configureOutput({
        writeErr: () => {},
      });
      await startREPL(program, latestForInteractiveStartup);
      return;
    }
    program.help();
  });

// Node
registerRPC(program);
registerBalance(program);
registerTx(program);
registerReceipt(program);
registerBlock(program);
registerTrace(program);
registerDebug(program);
registerGas(program);
registerLogs(program);

// Data
registerTokens(program);
registerNFTs(program);
registerTransfers(program);
registerPrices(program);
registerPortfolio(program);
registerSimulate(program);

// Execution
registerSend(program);
registerContract(program);

// Wallets
registerWallet(program);
registerBundler(program);
registerGasManager(program);
registerWebhooks(program);

// Chains
registerNetwork(program);
// Ops / Admin
registerApps(program);
registerAuth(program);
registerSetup(program);
registerConfig(program);
registerSolana(program);
registerAgentPrompt(program);
registerCompletions(program);
registerUpdateCheck(program);
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

process.on("unhandledRejection", (err) => exitWithError(err));
process.on("uncaughtException", (err) => exitWithError(err));
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => {
  if (!isJSONMode()) process.stderr.write("\nInterrupted.\n");
  process.exit(130);
});

program.parse();
