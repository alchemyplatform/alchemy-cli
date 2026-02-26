import Table from "cli-table3";
import { isJSONMode, isRevealMode, quiet } from "./output.js";
import { esc, rgb } from "./colors.js";

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

const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*m/g, "");

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

// ── Secret masking ──────────────────────────────────────────────────

export function maskSecret(value: string): string {
  if (value.length <= 8) return "\u2022".repeat(value.length);
  return value.slice(0, 4) + "\u2022".repeat(value.length - 8) + value.slice(-4);
}

export function maskIf(value: string): string {
  return isRevealMode() ? value : maskSecret(value);
}

let suppressBrandedHelp = false;

export function setBrandedHelpSuppressed(suppressed: boolean): void {
  suppressBrandedHelp = suppressed;
}

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
  if (isJSONMode() || quiet) return fn();

  const { spinner } = await import("@clack/prompts");
  const s = spinner();
  s.start(label);
  try {
    const result = await fn();
    s.stop(`${ansi.green("◇")} ${doneLabel}`);
    return result;
  } catch (err) {
    s.error();
    throw err;
  }
}

// ── Key-Value ────────────────────────────────────────────────────────

export function printKeyValue(
  pairs: Array<[string, string]>,
  withBottomPadding = true,
): void {
  if (isJSONMode()) return;
  const maxLen = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    console.log(`  ${ansi.dim(key.padEnd(maxLen))}  ${value}`);
  }
  if (withBottomPadding) {
    console.log("");
  }
}

export function printKeyValueBox(
  pairs: Array<[string, string]>,
): void {
  if (isJSONMode()) return;
  if (pairs.length === 0) {
    console.log(`  ${ansi.brand("┌──┐")}`);
    console.log(`  ${ansi.brand("└──┘")}`);
    return;
  }

  const keyWidth = Math.max(...pairs.map(([k]) => k.length));
  const contentRows = pairs.map(([key, value]) => {
    return `${ansi.dim(key.padEnd(keyWidth))}  ${value}`;
  });
  const contentWidth = Math.max(...contentRows.map((row) => stripAnsi(row).length));

  const top = `┌${"─".repeat(contentWidth + 2)}┐`;
  const bottom = `└${"─".repeat(contentWidth + 2)}┘`;
  console.log(`  ${ansi.dim(top)}`);
  for (const row of contentRows) {
    const visibleLen = stripAnsi(row).length;
    const padded = row + " ".repeat(Math.max(0, contentWidth - visibleLen));
    console.log(`  ${ansi.dim("│")} ${padded} ${ansi.dim("│")}`);
  }
  console.log(`  ${ansi.dim(bottom)}`);
}

export function emptyState(message: string): void {
  if (isJSONMode()) return;
  console.log(`\n  ${ansi.dim(`○ ${message}`)}`);
}

export function printSyntaxJSON(obj: unknown): void {
  if (isJSONMode()) {
    console.log(JSON.stringify(obj));
    return;
  }
  const raw = JSON.stringify(obj, null, 2);
  const highlighted = raw.replace(
    /("(?:\\.|[^"\\])*")\s*(:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b|\bnull\b)/g,
    (match, str, colon, num, lit) => {
      if (str && colon) return ansi.brand(str) + colon;
      if (str) return ansi.green(str);
      if (num) return ansi.cyan(num);
      if (lit) return ansi.yellow(lit);
      return match;
    },
  );
  console.log(highlighted);
}

export function divider(): void {
  if (isJSONMode()) return;
  console.log(`  ${ansi.dim("────────────────────────────────────")}`);
}

// ── Table ────────────────────────────────────────────────────────────

export function printTable(
  headers: string[],
  rows: string[][],
): void {
  if (isJSONMode()) {
    const objects = rows.map((row) =>
      Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null]))
    );
    console.log(JSON.stringify(objects, null, 2));
    return;
  }

  const table = new Table({
    head: headers.map((h) => ansi.brand(ansi.bold(h))),
    chars: {
      top: "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
      bottom: "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
      left: "│", "left-mid": "├",
      mid: "─", "mid-mid": "┼",
      right: "│", "right-mid": "┤",
      middle: "│",
    },
    style: {
      head: [],
      border: [],
      "padding-left": 1,
      "padding-right": 1,
    },
  });

  for (let i = 0; i < rows.length; i++) {
    const row = i % 2 === 1
      ? rows[i].map((cell) => ansi.dim(cell))
      : rows[i];
    table.push(row);
  }

  // Dim the border characters
  const output = table.toString();
  const dimBorders = output.replace(
    /[┌┐└┘┬┴├┤┼─│]/g,
    (ch) => ansi.dim(ch),
  );
  console.log(dimBorders);
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

export function brandedHelp(options?: { force?: boolean }): string {
  if (isJSONMode() || quiet) return "";
  if (suppressBrandedHelp && !options?.force) return "";

  // Reimplemented from the official mark geometry:
  // one shared vertical gradient and three separate bars.
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const gradientAt = (t: number) => {
    const c0 = { r: 5, g: 213, b: 255 }; // #05D5FF
    const c1 = { r: 54, g: 63, b: 249 }; // #363FF9 at 72.3958%
    const c2 = { r: 85, g: 51, b: 255 }; // #5533FF

    if (t <= 0.723958) {
      const p = t / 0.723958;
      return rgb(
        lerp(c0.r, c1.r, p),
        lerp(c0.g, c1.g, p),
        lerp(c0.b, c1.b, p),
      );
    }

    const p = (t - 0.723958) / (1 - 0.723958);
    return rgb(
      lerp(c1.r, c2.r, p),
      lerp(c1.g, c2.g, p),
      lerp(c1.b, c2.b, p),
    );
  };

  // Block wordmark with a brand-like vertical gradient.
  const markLines = [
    " █████╗ ██╗      ██████╗██╗  ██╗███████╗███╗   ███╗██╗   ██╗",
    "██╔══██╗██║     ██╔════╝██║  ██║██╔════╝████╗ ████║╚██╗ ██╔╝",
    "███████║██║     ██║     ███████║█████╗  ██╔████╔██║ ╚████╔╝ ",
    "██╔══██║██║     ██║     ██╔══██║██╔══╝  ██║╚██╔╝██║  ╚██╔╝  ",
    "██║  ██║███████╗╚██████╗██║  ██║███████╗██║ ╚═╝ ██║   ██║   ",
    "╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝   ╚═╝   ",
  ];
  const logo = markLines
    .map((line, i) => gradientAt(i / (markLines.length - 1))(line))
    .join("\n");

  return "\n" + logo + "\n";
}
