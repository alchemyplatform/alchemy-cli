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
    configKey: string;
    commandFamilies: string[];
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
    "Set ALCHEMY_API_KEY env var or run: alchemy config set api-key <key>",
  INVALID_API_KEY:
    "Check your API key and set a valid one: alchemy config set api-key <key>",
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
    "Run preflight: alchemy --json setup status, then follow nextCommands",
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

  const subs = cmd.commands;
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
      command: "alchemy --json setup status",
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
          "balance",
          "tx",
          "block",
          "rpc",
          "trace",
          "debug",
          "tokens",
          "nfts",
          "transfers",
          "prices",
          "portfolio",
          "simulate",
          "solana",
        ],
      },
      {
        method: "Access key",
        envVar: "ALCHEMY_ACCESS_KEY",
        flag: "--access-key <key>",
        configKey: "access-key",
        commandFamilies: ["apps", "network list --configured"],
      },
      {
        method: "Webhook API key",
        envVar: "ALCHEMY_WEBHOOK_API_KEY",
        flag: "--webhook-api-key <key>",
        configKey: "webhook-api-key",
        commandFamilies: ["webhooks"],
      },
      {
        method: "x402 wallet",
        envVar: "ALCHEMY_WALLET_KEY",
        flag: "--x402 --wallet-key-file <path>",
        configKey: "x402",
        commandFamilies: [
          "balance",
          "tx",
          "block",
          "rpc",
          "trace",
          "debug",
          "tokens",
          "nfts",
          "transfers",
        ],
      },
    ],
    commands,
    errors,
    examples: [
      "alchemy --json --no-interactive setup status",
      "alchemy --json --no-interactive update-check",
      "alchemy --json --no-interactive balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --api-key $ALCHEMY_API_KEY",
      "alchemy --json --no-interactive apps list --access-key $ALCHEMY_ACCESS_KEY",
      "alchemy --json --no-interactive rpc eth_blockNumber --api-key $ALCHEMY_API_KEY",
      "alchemy --json --no-interactive network list",
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
    lines.push(`    config:   alchemy config set ${auth.configKey} <value>`);
    lines.push(`    commands: ${auth.commandFamilies.join(", ")}`);
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
    .action(() => {
      const payload = buildAgentPrompt(program);
      printHuman(formatAsSystemPrompt(payload), payload);
    });
}
