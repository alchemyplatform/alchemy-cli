import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import type { Command } from "commander";

const COMMAND_NAMES = [
  "balance",
  "block",
  "config",
  "config set",
  "config get",
  "config list",
  "help",
  "network",
  "network list",
  "nfts",
  "rpc",
  "tokens",
  "tx",
  "version",
];

const NETWORK_NAMES = [
  "eth-mainnet",
  "eth-sepolia",
  "eth-holesky",
  "polygon-mainnet",
  "polygon-amoy",
  "arb-mainnet",
  "arb-sepolia",
  "opt-mainnet",
  "opt-sepolia",
  "base-mainnet",
  "base-sepolia",
];

export async function startREPL(program: Command): Promise<void> {
  if (!stdin.isTTY) return;

  const addressHistory: string[] = [];
  const completions = [...COMMAND_NAMES, ...NETWORK_NAMES];

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    prompt: "alchemy> ",
    completer: (line: string): readline.CompleterResult => {
      const all = [...completions, ...addressHistory];
      const hits = all.filter((c) => c.startsWith(line));
      return [hits.length ? hits : all, line];
    },
  });

  const prompt = (): void => rl.prompt();

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

    // Track addresses for autocomplete
    const words = trimmed.split(/\s+/);
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
    rl.on("close", resolve);
    prompt();
  });
}
