import type { Command } from "commander";
import { ErrorCode, EXIT_CODES, type ErrorCodeType } from "../lib/errors.js";
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
  executionPolicy: string[];
  preflight: { command: string; description: string };
  auth: Array<{
    method: string;
    envVar: string;
    flag: string;
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
  INVALID_ACCESS_KEY:
    "Check your access key: https://dashboard.alchemy.com/",
  ACCESS_KEY_REQUIRED:
    "Set ALCHEMY_ACCESS_KEY env var or run: alchemy config set access-key <key>",
  APP_REQUIRED:
    "Select an app: alchemy config set app <app-id>",
  ADMIN_API_ERROR:
    "Check the error message for details; verify access key permissions",
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
    "Run preflight: alchemy --json config status, then follow nextCommands",
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
      "Run alchemy --json --no-interactive update-check when you need to detect available CLI upgrades",
    ],
    preflight: {
      command: "alchemy --json config status",
      description:
        "Check auth readiness before first command. If complete is false, follow nextCommands in the response to configure auth.",
    },
    auth: [
      {
        method: "API key",
        envVar: "ALCHEMY_API_KEY",
        flag: "--api-key <key>",
        configKey: "api-key",
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
        method: "Access key",
        envVar: "ALCHEMY_ACCESS_KEY",
        flag: "--access-key <key>",
        configKey: "access-key",
        commandFamilies: ["app", "evm network"],
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
        setup: "alchemy wallet connect --mode local --chain evm",
        commandFamilies: [
          "evm send",
          "evm contract call",
          "evm swap",
          "evm approve",
          "xchain bridge",
        ],
        notes: "`--signer local` only selects the local signer. You still need a local EVM key via env, flag, or saved config.",
      },
    ],
    commands,
    errors,
    examples: [
      "alchemy --json --no-interactive config status",
      "alchemy --json --no-interactive update-check",
      "alchemy --json --no-interactive evm data balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --api-key $ALCHEMY_API_KEY",
      "alchemy --json --no-interactive app list --access-key $ALCHEMY_ACCESS_KEY",
      "alchemy --json --no-interactive evm rpc eth_blockNumber --api-key $ALCHEMY_API_KEY",
      "alchemy --json --no-interactive evm network list",
      "alchemy --json --no-interactive evm send 0xRecipient 0.001 -n eth-sepolia",
      "alchemy --json --no-interactive evm contract read 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \"balanceOf(address)(uint256)\" --args '[\"0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045\"]' -n eth-mainnet",
      "alchemy --json --no-interactive evm swap quote --from 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE --to 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 --amount 1.0 -n eth-mainnet",
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

  lines.push("Auth methods:");
  for (const auth of payload.auth) {
    lines.push(`  ${auth.method}:`);
    lines.push(`    env:      ${auth.envVar}`);
    lines.push(`    flag:     ${auth.flag}`);
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
    "For full command tree, run: alchemy --json agent-prompt",
  );
  lines.push("");

  return lines.join("\n");
}

export function registerAgentPrompt(program: Command) {
  program
    .command("agent-prompt")
    .description("Emit complete agent/automation usage instructions")
    .option("--commands <list>", "Filter to specific commands in JSON output (requires --json). Comma-separated (e.g. data,rpc,gas)")
    .action((opts: { commands?: string }) => {
      const payload = buildAgentPrompt(program);
      if (opts.commands) {
        const filter = new Set(opts.commands.split(",").map((s) => s.trim().toLowerCase()));
        payload.commands = payload.commands.filter((cmd) => filter.has(cmd.name.toLowerCase()));
      }
      printHuman(formatAsSystemPrompt(payload), payload);
    });
}
