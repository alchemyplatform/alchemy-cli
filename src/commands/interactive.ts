import * as readline from "node:readline";
import { stdin, stdout, stderr } from "node:process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Command } from "commander";
import {
  bold,
  brandedHelp,
  brand,
  dim,
  green,
  setBrandedHelpSuppressed,
} from "../lib/ui.js";
import { isJSONMode } from "../lib/output.js";
import { setReplMode } from "../lib/errors.js";
import { getRPCNetworkIds } from "../lib/networks.js";
import { configDir, load as loadConfig } from "../lib/config.js";
import { getSetupMethod } from "../lib/onboarding.js";
import { bgRgb, rgb, noColor } from "../lib/colors.js";
import { getUpdateNoticeLines } from "../lib/update-check.js";

const COMMAND_NAMES = [
  "apps",
  "apps list",
  "apps get",
  "apps create",
  "apps delete",
  "apps update",
  "apps networks",
  "apps address-allowlist",
  "apps origin-allowlist",
  "apps ip-allowlist",
  "bal",
  "balance",
  "block",
  "apps chains",
  "trace",
  "debug",
  "transfers",
  "prices",
  "prices symbol",
  "prices address",
  "prices historical",
  "portfolio",
  "portfolio tokens",
  "portfolio token-balances",
  "portfolio nfts",
  "portfolio nft-contracts",
  "portfolio transactions",
  "simulate",
  "simulate asset-changes",
  "simulate execution",
  "simulate asset-changes-bundle",
  "simulate execution-bundle",
  "webhooks",
  "webhooks list",
  "webhooks create",
  "webhooks update",
  "webhooks delete",
  "webhooks addresses",
  "webhooks nft-filters",
  "bundler",
  "bundler send-user-operation",
  "bundler estimate-user-operation-gas",
  "bundler get-user-operation-receipt",
  "gas-manager",
  "gas-manager request-gas-and-paymaster",
  "gas-manager request-paymaster-token-quote",
  "solana",
  "solana rpc",
  "solana das",
  "config",
  "config set",
  "config set api-key",
  "config set access-key",
  "config set app",
  "config set network",
  "config set verbose",
  "config set wallet-key-file",
  "config set x402",
  "config get",
  "config list",
  "help",
  "update-check",
  "network",
  "network list",
  "nfts",
  "nfts metadata",
  "nfts contract",
  "rpc",
  "setup",
  "setup status",
  "tokens",
  "tokens metadata",
  "tokens allowance",
  "tx",
  "receipt",
  "gas",
  "logs",
  "agent-prompt",
  "completions",
  "version",
  "wallet",
  "wallet generate",
  "wallet import",
  "wallet address",
];

const NETWORK_NAMES = getRPCNetworkIds();

const REPL_HISTORY_MAX = 100;

async function formatSetupMethodLabel(): Promise<string> {
  const method = await getSetupMethod(loadConfig());
  if (method === "api_key") return "API key";
  if (method === "access_key_app") return "Access key + app";
  if (method === "x402_wallet") return "SIWx wallet";
  if (method === "auth_token") return "Auth token";
  return "Not configured";
}

function replHistoryPath(): string {
  return join(configDir(), "repl-history");
}

function loadReplHistory(): string[] {
  const historyFilePath = replHistoryPath();
  if (!existsSync(historyFilePath)) return [];
  try {
    return readFileSync(historyFilePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-REPL_HISTORY_MAX);
  } catch {
    return [];
  }
}

function saveReplHistory(lines: string[]): void {
  const historyFilePath = replHistoryPath();
  const normalized = Array.from(
    new Set(lines.map((line) => line.trim()).filter(Boolean)),
  ).slice(-REPL_HISTORY_MAX);
  mkdirSync(dirname(historyFilePath), { recursive: true, mode: 0o755 });
  writeFileSync(historyFilePath, normalized.join("\n") + "\n", { mode: 0o600 });
}

export async function startREPL(
  program: Command,
  latestUpdate: string | null = null,
): Promise<void> {
  if (!stdin.isTTY) return;
  setReplMode(true);
  setBrandedHelpSuppressed(true);

  const applyExitOverride = (cmd: Command): void => {
    cmd.exitOverride();
    for (const subcommand of cmd.commands) {
      applyExitOverride(subcommand);
    }
  };
  applyExitOverride(program);

  const addressHistory: string[] = [];
  const rootCommands = Array.from(
    new Set(
      COMMAND_NAMES.map((name) => name.split(" ")[0]).concat([
        "help",
        "exit",
        "quit",
      ]),
    ),
  );

  const getCompletions = (line: string): string[] => {
    const input = line.trimStart();
    const hasTrailingSpace = /\s$/.test(input);
    const tokens = input.length > 0 ? input.split(/\s+/) : [];

    if (tokens.length === 0) {
      return rootCommands;
    }

    // Complete top-level commands first (e.g. `co` -> `config`).
    if (tokens.length === 1 && !hasTrailingSpace) {
      return rootCommands;
    }

    const first = tokens[0];
    const phraseWithoutLeading = input;
    const commandPhrases =
      first === "help"
        ? COMMAND_NAMES
        : COMMAND_NAMES.filter((name) => name.startsWith(first));

    const phraseCandidates = commandPhrases.filter((name) =>
      name.startsWith(phraseWithoutLeading),
    );

    // Offer network names after a network flag.
    const networkArgContext = /(?:^|\s)(?:-n|--network)\s+\S*$/.test(input);
    const networkCandidates = networkArgContext ? NETWORK_NAMES : [];

    // Offer seen addresses only when user is typing one.
    const addressPrefix = tokens[tokens.length - 1] ?? "";
    const addressCandidates =
      addressPrefix.startsWith("0x") && addressHistory.length > 0
        ? addressHistory
        : [];

    return Array.from(
      new Set([...phraseCandidates, ...networkCandidates, ...addressCandidates]),
    );
  };

  const longestCommonPrefix = (values: string[]): string => {
    if (values.length === 0) return "";
    if (values.length === 1) return values[0];

    let prefix = values[0];
    for (let i = 1; i < values.length; i += 1) {
      const value = values[i];
      let j = 0;
      while (j < prefix.length && j < value.length && prefix[j] === value[j]) {
        j += 1;
      }
      prefix = prefix.slice(0, j);
      if (!prefix) break;
    }
    return prefix;
  };

  const getCompletionMatches = (input: string): string[] =>
    Array.from(new Set(getCompletions(input)))
      .filter((c) => c.startsWith(input) && c !== input)
      .sort((a, b) => a.localeCompare(b));

  const getInlineSuggestion = (line: string): string => {
    const input = line.trimStart();
    if (!input) return "";

    const candidates = getCompletionMatches(input);
    if (candidates.length === 0) return "";

    const uniqueSorted = Array.from(new Set(candidates)).sort(
      (a, b) => a.length - b.length || a.localeCompare(b),
    );
    const best = uniqueSorted[0];
    if (!best || best === input) return "";

    return best.slice(input.length);
  };

  const printIntro = async (): Promise<void> => {
    if (isJSONMode()) return;
    process.stdout.write(brandedHelp({ force: true }));
    console.log("");
    console.log(`  ${brand("◆")} ${bold("Welcome to Alchemy CLI")}`);
    console.log(`  ${green("✓")} ${dim(`Configured auth: ${await formatSetupMethodLabel()}`)}`);
    console.log(`  ${dim("Run commands directly (no 'alchemy' prefix).")}`);
    console.log("");
    if (latestUpdate) {
      for (const line of getUpdateNoticeLines(latestUpdate)) {
        console.log(line);
      }
      console.log("");
    }
    console.log(`  ${brand("◆")} ${bold("Quick commands")}`);
    console.log(`  ${dim("- rpc eth_chainId")}`);
    console.log(`  ${dim("- config list")}`);
    console.log(`  ${dim("- network list")}`);
    console.log(`  ${dim("- help")}`);
    console.log("");
    console.log(`  ${dim("Press TAB for autocomplete. Type 'exit' or 'quit' to leave.")}`);
    console.log("");
    console.log("");
  };

  const PROMPT_STR = "\x1b[38;2;54;63;249m›\x1b[39m ";
  const submittedCommandBg = bgRgb(64, 64, 68);
  const submittedCommandFg = rgb(232, 232, 236);
  const OUTPUT_INDENT = "  ";
  const styleSubmittedCommand = (command: string): string => {
    if (!stdout.isTTY || noColor) return command;
    return submittedCommandBg(submittedCommandFg(` ${command} `));
  };
  const runWithIndentedOutput = async (fn: () => Promise<void>): Promise<void> => {
    if (isJSONMode() || !stdout.isTTY) {
      await fn();
      return;
    }

    const createIndentedWriter = (orig: typeof stdout.write): typeof stdout.write => {
      let atLineStart = true;
      return function (chunk: Uint8Array | string, ...rest: unknown[]): boolean {
        const str = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        if (!str) return true;

        let out = "";
        for (const ch of str) {
          if (atLineStart && ch !== "\n" && ch !== "\r") {
            out += OUTPUT_INDENT;
            atLineStart = false;
          }
          out += ch;
          if (ch === "\n" || ch === "\r") {
            atLineStart = true;
          }
        }

        return orig(out, ...(rest as [BufferEncoding, () => void]));
      } as typeof stdout.write;
    };

    const origStdoutWrite = stdout.write.bind(stdout);
    const origStderrWrite = stderr.write.bind(stderr);
    stdout.write = createIndentedWriter(origStdoutWrite);
    stderr.write = createIndentedWriter(origStderrWrite);

    try {
      await fn();
    } finally {
      stdout.write = origStdoutWrite as typeof stdout.write;
      stderr.write = origStderrWrite as typeof stderr.write;
    }
  };

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: PROMPT_STR,
    historySize: REPL_HISTORY_MAX,
    removeHistoryDuplicates: true,
  });

  // ── History & inline suggestion ────────────────────────────────────
  const initialHistory = loadReplHistory();
  const rlWithHistory = rl as readline.Interface & { history?: string[] };
  if (Array.isArray(rlWithHistory.history) && initialHistory.length > 0) {
    rlWithHistory.history = [...initialHistory].reverse();
  }

  const renderInlineSuggestion = (): void => {
    if (!stdout.isTTY) return;

    const line = rl.line;
    const cursor = typeof rl.cursor === "number" ? rl.cursor : line.length;
    if (cursor !== line.length) return;

    const suggestion = getInlineSuggestion(line);
    readline.clearLine(stdout, 1);
    if (!suggestion) return;

    stdout.write(dim(suggestion));
    readline.moveCursor(stdout, -suggestion.length, 0);
  };

  const acceptInlineCompletion = (): void => {
    const line = rl.line;
    const cursor = typeof rl.cursor === "number" ? rl.cursor : line.length;
    if (cursor !== line.length) return;

    const input = line.trimStart();
    const candidates = getCompletionMatches(input);
    if (candidates.length === 0) return;

    const prefix = longestCommonPrefix(Array.from(new Set(candidates)));
    if (prefix && prefix.length > input.length) {
      rl.write(prefix.slice(input.length));
      return;
    }

    const suggestion = getInlineSuggestion(line);
    if (suggestion) {
      rl.write(suggestion);
    }
  };

  // ── _ttyWrite override ────────────────────────────────────────────
  const rlWithTTYWrite = rl as readline.Interface & {
    _ttyWrite?: (s: string, key: readline.Key) => void;
  };
  const originalTTYWrite = rlWithTTYWrite._ttyWrite?.bind(rl);

  if (originalTTYWrite) {
    rlWithTTYWrite._ttyWrite = (s: string, key: readline.Key): void => {
      if (key?.name === "return" && !rl.line.trim()) {
        return;
      }
      if (key?.name === "tab") {
        acceptInlineCompletion();
        return;
      }
      originalTTYWrite(s, key);
    };
  }

  const onKeypress = (_char: string, key?: readline.Key): void => {
    if (key?.name === "tab") return;

    // Some readline paths do not invoke refresh hooks on character insert.
    setImmediate(() => {
      renderInlineSuggestion();
    });
  };
  stdin.on("keypress", onKeypress);

  const restoreStdinState = (): void => {
    // Some command handlers (or their dependencies) may pause/unref stdin
    // or disable raw mode. Aggressively restore TTY state so readline can
    // process arrow keys and autocomplete correctly after errors.
    stdin.resume();
    (stdin as NodeJS.ReadStream & { ref?: () => void }).ref?.();
    if (stdin.isTTY && typeof stdin.setRawMode === "function") {
      try {
        stdin.setRawMode(true);
      } catch {
        // stdin may have been destroyed — ignore
      }
    }
  };

  const prompt = (): void => {
    restoreStdinState();
    rl.prompt();
  };

  const printPostOutputSpacing = (): void => {
    if (!isJSONMode() && stdout.isTTY) {
      console.log("");
    }
  };

  const onLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed === "exit" || trimmed === "quit") {
      rl.close();
      return;
    }

    if (!isJSONMode() && stdout.isTTY) {
      readline.moveCursor(stdout, 0, -1);
      readline.clearLine(stdout, 0);
      stdout.write(styleSubmittedCommand(trimmed) + "\n");
      console.log("");
    }

    const words = trimmed.split(/\s+/);

    // Friendly REPL help shortcuts:
    // - `help` -> global help
    // - `help <command ...>` -> scoped command help
    const isHelpRequest = words[0] === "help" || words.includes("--help") || words.includes("-h");
    if (isHelpRequest) {
      // Normalize: "help balance" → ["balance", "--help"], "balance --help" → ["balance", "--help"]
      const target = words[0] === "help"
        ? [...words.slice(1).filter(w => w !== "--help" && w !== "-h"), "--help"]
        : [...words.filter(w => w !== "--help" && w !== "-h"), "--help"];
      try {
        // Capture help output, strip "alchemy " prefix so it matches
        // the REPL context where commands are typed without the prefix,
        // then print the result with indentation.
        let helpText = "";
        const origWrite = stdout.write.bind(stdout);
        stdout.write = ((chunk: Uint8Array | string): boolean => {
          helpText += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
          return true;
        }) as typeof stdout.write;
        try {
          await program.parseAsync(["node", "alchemy", ...target]);
        } catch {
          // Commander throws after writing help — expected
        } finally {
          stdout.write = origWrite as typeof stdout.write;
        }
        // Strip "alchemy " prefix (possibly ANSI-wrapped) and remove the
        // "Interactive mode" quick-start line since we're already in the REPL.
        if (helpText) {
          const ansiOpt = "(?:\\x1b\\[[0-9;]*m)*";
          const alchemyPrefixRe = new RegExp(
            `(^|Usage: |  )${ansiOpt}alchemy${ansiOpt} `,
            "gm",
          );
          const stripped = helpText
            .replace(alchemyPrefixRe, "$1")
            .replace(/^.*Interactive mode with guided setup.*\n?/gm, "");
          await runWithIndentedOutput(async () => {
            process.stdout.write(stripped);
          });
        }
      } catch {
        // Unexpected errors
      } finally {
        restoreStdinState();
      }
      printPostOutputSpacing();
      prompt();
      return;
    }

    // Track addresses for autocomplete
    for (const w of words) {
      if (w.startsWith("0x") && w.length > 10 && !addressHistory.includes(w)) {
        addressHistory.push(w);
      }
    }

    try {
      await runWithIndentedOutput(async () => {
        await program.parseAsync(["node", "alchemy", ...words]);
      });
    } catch {
      // Commander errors are already handled by exitOverride
    } finally {
      restoreStdinState();
    }

    printPostOutputSpacing();
    prompt();
  };

  return new Promise<void>((resolve) => {
    rl.on("line", (line) => void onLine(line));
    rl.on("close", () => {
      if (Array.isArray(rlWithHistory.history)) {
        saveReplHistory([...rlWithHistory.history].reverse());
      }
      setReplMode(false);
      setBrandedHelpSuppressed(false);
      stdin.off("keypress", onKeypress);
      resolve();
    });
    void printIntro().then(() => prompt());
  });
}
