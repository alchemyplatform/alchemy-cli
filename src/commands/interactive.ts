import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
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
import { ScrollbackBuffer } from "../lib/scrollback.js";
import { setReplMode } from "../index.js";
import { getRPCNetworkIds } from "../lib/networks.js";
import { configDir, load as loadConfig } from "../lib/config.js";
import { getSetupMethod } from "../lib/onboarding.js";

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
  "balance",
  "block",
  "chains",
  "chains list",
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
  "network",
  "network list",
  "nfts",
  "rpc",
  "setup",
  "setup status",
  "tokens",
  "tx",
  "version",
  "wallet",
  "wallet generate",
  "wallet import",
  "wallet address",
];

const NETWORK_NAMES = getRPCNetworkIds();

const REPL_HISTORY_MAX = 100;

function formatSetupMethodLabel(): string {
  const method = getSetupMethod(loadConfig());
  if (method === "api_key") return "API key";
  if (method === "access_key_app") return "Access key + app";
  if (method === "x402_wallet") return "x402 wallet";
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

export async function startREPL(program: Command): Promise<void> {
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

  const printIntro = (): void => {
    if (isJSONMode()) return;
    process.stdout.write(brandedHelp({ force: true }));
    console.log(`  ${brand("◆")} ${bold("Welcome to Alchemy CLI")}`);
    console.log(`  ${green("✓")} ${dim(`Configured auth: ${formatSetupMethodLabel()}`)}`);
    console.log(`  ${dim("Run commands directly (no 'alchemy' prefix).")}`);
    console.log("");
    console.log(`  ${brand("◆")} ${bold("Quick commands")}`);
    console.log(`  ${dim("- rpc eth_chainId")}`);
    console.log(`  ${dim("- config list")}`);
    console.log(`  ${dim("- network list")}`);
    console.log(`  ${dim("- help")}`);
    console.log("");
    console.log(`  ${dim("Press TAB for autocomplete. Type 'exit' or 'quit' to leave.")}`);
    console.log("");
  };

  const scrollback = new ScrollbackBuffer();
  const PROMPT_STR = "alchemy \x1b[38;2;54;63;249m◆\x1b[39m ";
  scrollback.setPrompt(PROMPT_STR);

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: PROMPT_STR,
    historySize: REPL_HISTORY_MAX,
    removeHistoryDuplicates: true,
  });

  // ── Mouse-event stdin filtering ────────────────────────────────────
  // Grab the data listener installed by readline/emitKeypressEvents and
  // replace it with a wrapper that strips SGR mouse sequences.  The
  // original listener (the keypress parser) never sees mouse bytes.
  const MOUSE_SEQ_RE = /\x1b\[<(\d+);\d+;\d+[Mm]/g;
  const dataListeners = stdin.listeners("data") as ((...args: unknown[]) => void)[];
  const origDataListener = dataListeners[dataListeners.length - 1];
  stdin.removeListener("data", origDataListener);

  const filteredDataListener = (chunk: string | Buffer): void => {
    const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let match: RegExpExecArray | null;
    MOUSE_SEQ_RE.lastIndex = 0;
    while ((match = MOUSE_SEQ_RE.exec(str)) !== null) {
      const button = parseInt(match[1], 10);
      if (button === 64) {
        scrollback.scrollUp();
      } else if (button === 65) {
        scrollback.scrollDown();
        if (!scrollback.isScrolled) {
          // Reached the bottom via mouse scroll — readline doesn't know the
          // screen was redrawn, so force it to redraw the prompt.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = rl as any;
          if (r.prevRows !== undefined) r.prevRows = 0;
          if (r._refreshLine) r._refreshLine();
        }
      }
    }
    const cleaned = str.replace(MOUSE_SEQ_RE, "");
    if (cleaned) origDataListener(cleaned);
  };
  stdin.on("data", filteredDataListener);

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

  const rlWithRefresh = rl as readline.Interface & { _refreshLine?: () => void };
  const originalRefreshLine = rlWithRefresh._refreshLine?.bind(rl);
  if (originalRefreshLine) {
    rlWithRefresh._refreshLine = (): void => {
      originalRefreshLine();
      renderInlineSuggestion();
    };
  }

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
      if (key?.name === "tab") {
        acceptInlineCompletion();
        return;
      }
      if (scrollback.isScrolled) {
        scrollback.snapToBottom();
        if (rlWithRefresh._refreshLine) rlWithRefresh._refreshLine();
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

  const prompt = (): void => {
    // Some command handlers (or their dependencies) may pause/unref stdin.
    // Ensure the REPL keeps the TTY stream alive between commands and
    // restore raw mode so arrow keys are interpreted by readline.
    stdin.resume();
    (stdin as NodeJS.ReadStream & { ref?: () => void }).ref?.();
    if (stdin.isTTY && typeof stdin.setRawMode === "function") {
      stdin.setRawMode(true);
    }
    rl.prompt();
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

    const words = trimmed.split(/\s+/);

    // Friendly REPL help shortcuts:
    // - `help` -> global help
    // - `help <command ...>` -> scoped command help
    if (words[0] === "help") {
      const target = words.slice(1);
      try {
        await program.parseAsync(["node", "alchemy", ...target, "--help"]);
      } catch {
        // Commander help/errors are already handled by exitOverride
      }
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
      await program.parseAsync(["node", "alchemy", ...words]);
    } catch {
      // Commander errors are already handled by exitOverride
    }

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
      stdin.removeListener("data", filteredDataListener);
      stdin.on("data", origDataListener);
      scrollback.dispose();
      resolve();
    });
    printIntro();
    prompt();
  });
}
