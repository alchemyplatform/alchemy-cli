import type { Command } from "commander";
import {
  ErrorCode,
  EXIT_CODES,
  errInvalidArgs,
  exitWithError,
  type ErrorCodeType,
} from "../lib/errors.js";
import { isJSONMode, printJSON, printHuman } from "../lib/output.js";

interface CommandSchema {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: Array<{ name: string; description: string; required: boolean }>;
  options?: Array<{ flags: string; description: string }>;
  subcommands?: CommandSchema[];
}

interface ErrorEntry {
  exitCode: number;
  retryable: boolean;
  recovery: string;
}

interface AgentPrompt {
  scope?: AgentPromptScope;
  executionPolicy: string[];
  preflight: { command: string; description: string };
  transactionPreflight: string[];
  runtimeDiscovery: {
    installed: { command: string; description: string };
    latest: { command: string; description: string };
    commandHelp: { commandTemplate: string; description: string };
    versionCheck: {
      installedCommand: string;
      latestCommand: string;
      description: string;
    };
    pathCheck: { command: string; description: string };
  };
  auth: Array<{
    method: string;
    envVar?: string;
    flag?: string;
    configKey?: string;
    setup?: string;
    commandFamilies: string[];
    notes?: string;
  }>;
  commands: CommandSchema[];
  errors: Record<string, ErrorEntry>;
  examples: string[];
  docs: string;
}

type AgentPromptScope =
  | "wallet"
  | "evm"
  | "solana"
  | "webhook"
  | "app"
  | "data"
  | "xchain";

const AGENT_PROMPT_SCOPES: AgentPromptScope[] = [
  "wallet",
  "evm",
  "solana",
  "webhook",
  "app",
  "data",
  "xchain",
];

const SCOPE_COMMAND_PATHS: Record<AgentPromptScope, string[]> = {
  app: ["app", "auth", "config"],
  data: ["evm data", "evm logs", "evm block", "evm tx", "evm receipt"],
  evm: ["evm"],
  solana: ["solana"],
  wallet: [
    "wallet",
    "evm send",
    "evm contract",
    "evm swap",
    "evm approve",
    "evm status",
    "xchain bridge",
  ],
  webhook: ["webhook", "config set webhook-api-key"],
  xchain: ["xchain"],
};

const SCOPE_EXAMPLE_MATCHERS: Record<AgentPromptScope, string[]> = {
  app: [" app ", " auth ", " config "],
  data: [" evm data ", " evm logs ", " evm block ", " evm tx ", " evm receipt "],
  evm: [" evm "],
  solana: [" solana "],
  wallet: [" wallet ", " evm send ", " evm swap ", " evm approve ", " xchain bridge "],
  webhook: [" webhook "],
  xchain: [" xchain "],
};

const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  ErrorCode.RATE_LIMITED,
  ErrorCode.NETWORK_ERROR,
]);

const ERROR_RECOVERY: Record<ErrorCodeType, string> = {
  AUTH_REQUIRED:
    "Set ALCHEMY_API_KEY env var or run: alchemy config set app",
  INVALID_API_KEY:
    "Check your API key and select a valid app: alchemy config set app",
  NETWORK_NOT_ENABLED:
    "Enable the target network for your app at dashboard.alchemy.com",
  APP_REQUIRED:
    "Select an app: alchemy config set app <app-id>",
  ADMIN_API_ERROR:
    "Check the error message for details; verify account permissions",
  NETWORK_ERROR:
    "Check internet connection and retry",
  RPC_ERROR:
    "Check RPC method, params, and network; verify API key has access",
  INVALID_ARGS:
    "Check command usage via: alchemy --json help <command>",
  NOT_FOUND:
    "Verify the resource identifier (address, hash, id) is correct",
  RATE_LIMITED:
    "Wait and retry; consider upgrading your Alchemy plan",
  PAYMENT_REQUIRED:
    "Fund your x402 wallet or switch to API key auth",
  SETUP_REQUIRED:
    "Run preflight: alchemy --json --no-interactive config status, then follow nextCommands",
  QUOTE_FAILED:
    "Quote unavailable; check data.cause for the specific reason (INSUFFICIENT_BALANCE, INSUFFICIENT_LIQUIDITY, UNSUPPORTED_ROUTE, QUOTE_REVERTED, QUOTE_FAILED) and follow the hint",
  PREFLIGHT_REVERT:
    "Transaction preflight reverted; inspect data.reason, fix balance/allowance/calldata, and retry with --dry-run when available",
  INTERNAL_ERROR:
    "Unexpected error; retry or report a bug",
};

function buildCommandSchema(cmd: Command): CommandSchema {
  const schema: CommandSchema = {
    name: cmd.name(),
    description: cmd.description(),
  };

  const aliases = cmd.aliases();
  if (aliases.length > 0) {
    schema.aliases = aliases;
  }

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

  // Skip hidden subcommands (legacy back-compat aliases) so the agent-facing
  // schema only describes the canonical surface.
  const subs = cmd.commands.filter(
    (s) => !(s as Command & { hidden?: boolean }).hidden,
  );
  if (subs.length > 0) {
    schema.subcommands = subs.map(buildCommandSchema);
  }

  return schema;
}

function commandMatchesPath(cmd: CommandSchema, path: string[]): CommandSchema | null {
  if (path[0] !== cmd.name) return null;
  if (path.length === 1) return cmd;
  if (!cmd.subcommands) return null;

  const childMatches = filterCommandSchemas(cmd.subcommands, [path.slice(1)]);
  if (childMatches.length === 0) return null;
  return {
    ...cmd,
    subcommands: childMatches,
  };
}

function filterCommandSchemas(
  commands: CommandSchema[],
  paths: string[][],
): CommandSchema[] {
  const filtered: CommandSchema[] = [];
  for (const cmd of commands) {
    const matches = paths
      .map((path) => commandMatchesPath(cmd, path))
      .filter((match): match is CommandSchema => Boolean(match));
    if (matches.length === 0) continue;
    if (matches.some((match) => match === cmd)) {
      filtered.push(cmd);
      continue;
    }
    const subcommands = matches.flatMap((match) => match.subcommands ?? []);
    filtered.push({
      ...cmd,
      subcommands,
    });
  }
  return filtered;
}

function parseScope(value: string | undefined): AgentPromptScope | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (AGENT_PROMPT_SCOPES.includes(normalized as AgentPromptScope)) {
    return normalized as AgentPromptScope;
  }
  throw errInvalidArgs(
    `Unknown agent-prompt scope '${value}'. Use one of: ${AGENT_PROMPT_SCOPES.join(", ")}.`,
  );
}

function applyScope(payload: AgentPrompt, scope: AgentPromptScope | undefined): void {
  if (!scope) return;

  payload.scope = scope;
  payload.commands = filterCommandSchemas(
    payload.commands,
    SCOPE_COMMAND_PATHS[scope].map((path) => path.split(" ")),
  );

  const matchers = SCOPE_EXAMPLE_MATCHERS[scope];
  payload.examples = payload.examples.filter((example) =>
    matchers.some((matcher) => ` ${example} `.includes(matcher)),
  );
}

function buildAgentPrompt(program: Command): AgentPrompt {
  const errors: Record<string, ErrorEntry> = {};
  for (const [code, exitCode] of Object.entries(EXIT_CODES)) {
    errors[code] = {
      exitCode,
      retryable: RETRYABLE_CODES.has(code),
      recovery: ERROR_RECOVERY[code as ErrorCodeType] ?? "Check error message",
    };
  }

  const commands = program.commands
    .filter((cmd) => cmd.name() !== "agent-prompt")
    .map(buildCommandSchema);

  return {
    executionPolicy: [
      "Always pass --json --no-interactive",
      "Parse stdout as JSON on exit code 0",
      "Parse stderr as JSON on nonzero exit code",
      "Never run bare 'alchemy' without --json --no-interactive",
      "Before answering Alchemy CLI capability or usage questions, inspect the live command contract from agent-prompt and trust it over model memory",
      "For general capability and usage questions, prefer npx -y @alchemy/cli@latest --json --no-interactive agent-prompt so stale local installs or PATH shims do not hide new commands",
      "Use the user's installed alchemy binary only when executing commands against their local config or diagnosing their installed version",
      "If installed alchemy help contradicts latest npm help, compare alchemy --json --no-interactive version with npx -y @alchemy/cli@latest --json --no-interactive version and check command -v alchemy",
      "Run alchemy --json --no-interactive update-check when you need to detect available CLI upgrades",
      "For state-changing EVM commands, prefer preview flags such as --dry-run when available before asking the user to execute",
      "For large data reads, use output-size controls such as --limit or --summary when available",
    ],
    preflight: {
      command: "alchemy --json --no-interactive config status",
      description:
        "Check auth readiness before first command. Use capabilities.rpc_data/admin_api/notify_webhooks/wallet_signing/x402 to scope setup to the intended command family.",
    },
    transactionPreflight: [
      "Before `evm send`, check the sender's native balance with `alchemy --json --no-interactive evm data balance <address> -n <network>`.",
      "Before ERC-20 sends, swaps, approvals, or bridges, verify the source token balance/allowance or request a quote first; do not infer spendability from a configured wallet alone.",
      "If a balance is zero or below the requested amount, stop and report the funding gap instead of retrying the transaction.",
    ],
    runtimeDiscovery: {
      installed: {
        command: "alchemy --json --no-interactive agent-prompt",
        description:
          "Use for the user's currently installed CLI only when executing against local config or diagnosing local install behavior.",
      },
      latest: {
        command: "npx -y @alchemy/cli@latest --json --no-interactive agent-prompt",
        description:
          "Default source of truth for general capability and usage questions; avoids stale local installs and PATH shims.",
      },
      commandHelp: {
        commandTemplate: "npx -y @alchemy/cli@latest --no-interactive help <command...>",
        description:
          "Use for command-specific help from the latest published CLI when constructing an invocation.",
      },
      versionCheck: {
        installedCommand: "alchemy --json --no-interactive version",
        latestCommand: "npx -y @alchemy/cli@latest --json --no-interactive version",
        description:
          "Compare when local help or agent-prompt output appears stale after an install or update.",
      },
      pathCheck: {
        command: "command -v alchemy && alchemy version",
        description:
          "Use when installed CLI behavior contradicts the latest contract or an update appears not to take effect.",
      },
    },
    auth: [
      {
        method: "API key",
        envVar: "ALCHEMY_API_KEY",
        flag: "--api-key <key>",
        commandFamilies: [
          "evm data",
          "evm tx",
          "evm block",
          "evm rpc",
          "evm trace",
          "evm debug",
          "evm simulate",
          "solana",
          "evm send",
          "evm contract",
          "evm swap",
          "evm approve",
          "evm status",
        ],
      },
      {
        method: "Alchemy login",
        setup: "alchemy auth login",
        commandFamilies: ["app", "evm network", "gas-manager"],
        notes:
          "Admin surfaces use the browser login session stored by `alchemy auth login`.",
      },
      {
        method: "Webhook API key",
        envVar: "ALCHEMY_WEBHOOK_API_KEY",
        flag: "--webhook-api-key <key>",
        configKey: "webhook-api-key",
        commandFamilies: ["webhook"],
      },
      {
        method: "x402 wallet",
        envVar: "ALCHEMY_WALLET_KEY",
        flag: "--x402 --wallet-key-file <path>",
        configKey: "x402",
        commandFamilies: [
          "evm data",
          "evm tx",
          "evm block",
          "evm rpc",
          "evm trace",
          "evm debug",
        ],
      },
      {
        method: "Wallet session signer (recommended)",
        envVar: "ALCHEMY_ACTIVE_SIGNER",
        flag: "--signer session",
        setup: "alchemy wallet connect && alchemy wallet use session",
        commandFamilies: [
          "evm send",
          "evm contract call",
          "evm swap",
          "evm approve",
          "xchain bridge",
        ],
        notes: "Signer selection only. Requires an approved wallet session plus an auth token; ALCHEMY_ACTIVE_SIGNER does not authenticate by itself.",
      },
      {
        method: "Local wallet + API key",
        envVar: "ALCHEMY_WALLET_KEY",
        flag: "--wallet-key-file <path> | --signer local",
        setup: "alchemy wallet connect --mode local",
        commandFamilies: [
          "evm send",
          "evm contract call",
          "evm swap",
          "evm approve",
          "xchain bridge",
        ],
        notes: "Use only when you explicitly need a local private key. `--signer local` selects the local signer but still requires a local EVM key via env, flag, or saved config.",
      },
    ],
    commands,
    errors,
    examples: [
      "alchemy --json --no-interactive config status",
      "alchemy --json --no-interactive update-check",
      "alchemy --json --no-interactive evm data balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --api-key $ALCHEMY_API_KEY -n eth-mainnet",
      "alchemy --json --no-interactive app list",
      "alchemy --json --no-interactive evm rpc eth_blockNumber --api-key $ALCHEMY_API_KEY -n eth-mainnet",
      "alchemy --json --no-interactive evm network list",
      "alchemy --json --no-interactive evm send 0xRecipient 0.001 --dry-run -n eth-sepolia",
      "alchemy --json --no-interactive evm contract read 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \"balanceOf(address)(uint256)\" --args '[\"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\"]' -n eth-mainnet",
      "alchemy --json --no-interactive evm swap quote --from 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE --to 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --amount 1.0 --from-address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n eth-mainnet",
      "alchemy --json --no-interactive evm logs --from-block latest --limit 25 -n eth-mainnet",
      "alchemy --json --no-interactive evm block latest --summary -n eth-mainnet",
      "alchemy --json --no-interactive evm status 0xCallId -n eth-mainnet",
    ],
    docs: "https://www.alchemy.com/docs",
  };
}

function formatAsSystemPrompt(payload: AgentPrompt): string {
  const lines: string[] = [];

  lines.push("Alchemy CLI agent instructions");
  lines.push("==============================");
  lines.push("");

  lines.push("Execution policy:");
  for (const rule of payload.executionPolicy) {
    lines.push(`  - ${rule}`);
  }
  lines.push("");

  lines.push("Preflight:");
  lines.push(`  Command: ${payload.preflight.command}`);
  lines.push(`  ${payload.preflight.description}`);
  lines.push("");

  lines.push("Transaction preflight:");
  for (const rule of payload.transactionPreflight) {
    lines.push(`  - ${rule}`);
  }
  lines.push("");

  lines.push("Runtime discovery:");
  lines.push(`  Installed CLI: ${payload.runtimeDiscovery.installed.command}`);
  lines.push(`    ${payload.runtimeDiscovery.installed.description}`);
  lines.push(`  Latest npm CLI: ${payload.runtimeDiscovery.latest.command}`);
  lines.push(`    ${payload.runtimeDiscovery.latest.description}`);
  lines.push(`  Command help: ${payload.runtimeDiscovery.commandHelp.commandTemplate}`);
  lines.push(`    ${payload.runtimeDiscovery.commandHelp.description}`);
  lines.push(`  Installed version: ${payload.runtimeDiscovery.versionCheck.installedCommand}`);
  lines.push(`  Latest npm version: ${payload.runtimeDiscovery.versionCheck.latestCommand}`);
  lines.push(`    ${payload.runtimeDiscovery.versionCheck.description}`);
  lines.push(`  Path check: ${payload.runtimeDiscovery.pathCheck.command}`);
  lines.push(`    ${payload.runtimeDiscovery.pathCheck.description}`);
  lines.push("");

  lines.push("Auth methods:");
  for (const auth of payload.auth) {
    lines.push(`  ${auth.method}:`);
    if (auth.envVar) {
      lines.push(`    env:      ${auth.envVar}`);
    }
    if (auth.flag) {
      lines.push(`    flag:     ${auth.flag}`);
    }
    if (auth.configKey) {
      lines.push(`    config:   alchemy config set ${auth.configKey} <value>`);
    }
    if (auth.setup) {
      lines.push(`    setup:    ${auth.setup}`);
    }
    lines.push(`    commands: ${auth.commandFamilies.join(", ")}`);
    if (auth.notes) {
      lines.push(`    notes:    ${auth.notes}`);
    }
  }
  lines.push("");

  lines.push("Error codes:");
  for (const [code, entry] of Object.entries(payload.errors)) {
    const retry = entry.retryable ? " [retryable]" : "";
    lines.push(`  ${code} (exit ${entry.exitCode})${retry}: ${entry.recovery}`);
  }
  lines.push("");

  lines.push("Examples:");
  for (const example of payload.examples) {
    lines.push(`  ${example}`);
  }
  lines.push("");

  lines.push(`Docs: ${payload.docs}`);
  lines.push("  For RPC method signatures, parameters, and supported networks.");
  lines.push("");
  lines.push(
    "For full command tree, run: alchemy --json --no-interactive agent-prompt",
  );
  lines.push("");

  return lines.join("\n");
}

export function registerAgentPrompt(program: Command) {
  program
    .command("agent-prompt")
    .description("Emit complete agent/automation usage instructions")
    .option("--scope <scope>", "Filter output to a command area: wallet, evm, solana, webhook, app, data, xchain")
    .option("--commands <list>", "Filter to specific commands in JSON output (requires --json). Comma-separated (e.g. data,rpc,gas)")
    .action((opts: { commands?: string; scope?: string }) => {
      try {
        const payload = buildAgentPrompt(program);
        applyScope(payload, parseScope(opts.scope));
        if (opts.commands) {
          const filter = new Set(opts.commands.split(",").map((s) => s.trim().toLowerCase()));
          payload.commands = payload.commands.filter((cmd) => filter.has(cmd.name.toLowerCase()));
        }
        printHuman(formatAsSystemPrompt(payload), payload);
      } catch (err) {
        exitWithError(err);
      }
    });
}
