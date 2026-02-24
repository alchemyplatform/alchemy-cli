import Table from "cli-table3";
import { isJSONMode } from "./output.js";

// ── Raw ANSI helpers ─────────────────────────────────────────────────

const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;

const rgb = (r: number, g: number, b: number) =>
  (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;

const ansi = {
  green: esc("32"),
  red: esc("31"),
  dim: esc("2"),
  cyan: esc("36"),
  bold: esc("1"),
  yellow: esc("33"),
  // Alchemy brand colors
  brand: rgb(54, 63, 249),       // Primary #363FF9
  brandSecondary: rgb(139, 92, 246), // Secondary #8B5CF6
};

// ── Colors (no-op in JSON mode) ──────────────────────────────────────

function wrap(fn: (s: string) => string) {
  return (s: string) => (isJSONMode() ? s : fn(s));
}

export const green = wrap(ansi.green);
export const red = wrap(ansi.red);
export const dim = wrap(ansi.dim);
export const cyan = wrap(ansi.cyan);
export const bold = wrap(ansi.bold);
export const yellow = wrap(ansi.yellow);
export const brand = wrap(ansi.brand);

// ── Badges ───────────────────────────────────────────────────────────

export function successBadge(): string {
  return isJSONMode() ? "Success" : ansi.green("✓");
}

export function failBadge(): string {
  return isJSONMode() ? "Failed" : ansi.red("✗");
}

// ── Spinner ──────────────────────────────────────────────────────────

export async function withSpinner<T>(
  label: string,
  doneLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (isJSONMode()) return fn();

  const yoctoSpinner = (await import("yocto-spinner")).default;
  const spinner = yoctoSpinner({ text: label }).start();
  try {
    const result = await fn();
    spinner.success(doneLabel);
    return result;
  } catch (err) {
    spinner.error();
    throw err;
  }
}

// ── Table ────────────────────────────────────────────────────────────

export function printTable(
  headers: string[],
  rows: string[][],
): void {
  const table = new Table({
    head: isJSONMode() ? headers : headers.map((h) => ansi.brand(h)),
    style: isJSONMode()
      ? { head: [], border: [] }
      : {},
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

// ── Shared utilities ─────────────────────────────────────────────────

export function weiToEth(wei: bigint): string {
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const remainder = wei % divisor;

  if (remainder === 0n) return `${whole}.0`;

  const remStr = remainder.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${remStr}`;
}

export function timeAgo(hexTimestamp: string): string {
  const seconds = parseInt(hexTimestamp, 16);
  if (isNaN(seconds)) return hexTimestamp;

  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;

  if (diff < 0) return "in the future";
  if (diff < 60) return `${diff} seconds ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} days ago`;
  return `${Math.floor(diff / 2592000)} months ago`;
}

const EXPLORER_MAP: Record<string, string> = {
  "eth-mainnet": "https://etherscan.io",
  "eth-sepolia": "https://sepolia.etherscan.io",
  "eth-holesky": "https://holesky.etherscan.io",
  "polygon-mainnet": "https://polygonscan.com",
  "polygon-amoy": "https://amoy.polygonscan.com",
  "arb-mainnet": "https://arbiscan.io",
  "arb-sepolia": "https://sepolia.arbiscan.io",
  "opt-mainnet": "https://optimistic.etherscan.io",
  "opt-sepolia": "https://sepolia-optimism.etherscan.io",
  "base-mainnet": "https://basescan.org",
  "base-sepolia": "https://sepolia.basescan.org",
};

export function etherscanTxURL(
  hash: string,
  network: string,
): string | undefined {
  const base = EXPLORER_MAP[network];
  if (!base) return undefined;
  return `${base}/tx/${hash}`;
}

// ── Branded help ─────────────────────────────────────────────────────

export function brandedHelp(): string {
  if (isJSONMode()) return "";

  return ansi.brand(`
    _    _      _
   / \\  | | ___| |__   ___ _ __ ___  _   _
  / _ \\ | |/ __| '_ \\ / _ \\ '_ \` _ \\| | | |
 / ___ \\| | (__| | | |  __/ | | | | | |_| |
/_/   \\_\\_|\\___|_| |_|\\___|_| |_| |_|\\__, |
                                      |___/
`);
}
