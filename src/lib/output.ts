import { CLIError } from "./errors.js";
import { forceColor, noColor } from "./colors.js";

export let forceJSON = false;
export let quiet = false;
export let verbose = false;
export let debugMode = false;
export let timeout: number | undefined;
let reveal = false;
const ansi = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  boldRed: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

const SENSITIVE_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "INVALID_API_KEY",
  "INVALID_ACCESS_KEY",
  "ACCESS_KEY_REQUIRED",
]);

const ALCHEMY_KEY_PATH_MARKERS = ["alchemy.com/v2/", "alchemy.com/nft/v3/"] as const;

function isSecretBoundaryChar(char: string): boolean {
  return (
    char === "/" ||
    char === "?" ||
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === '"' ||
    char === "'" ||
    char === "`"
  );
}

function redactAfterMarker(input: string, marker: string): string {
  const lower = input.toLowerCase();
  let index = 0;
  let cursor = 0;
  let out = "";

  while (index < input.length) {
    const markerIndex = lower.indexOf(marker, index);
    if (markerIndex === -1) break;

    const secretStart = markerIndex + marker.length;
    let secretEnd = secretStart;
    while (secretEnd < input.length && !isSecretBoundaryChar(input[secretEnd])) {
      secretEnd += 1;
    }

    out += input.slice(cursor, secretStart);
    out += "[REDACTED]";
    cursor = secretEnd;
    index = secretEnd;
  }

  if (!out) return input;
  return out + input.slice(cursor);
}

function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const marker of ALCHEMY_KEY_PATH_MARKERS) {
    redacted = redactAfterMarker(redacted, marker);
  }
  return redacted;
}

function toSafeErrorJSON(err: CLIError): Record<string, unknown> {
  const payload = err.toJSON() as {
    error?: {
      code?: string;
      message?: string;
      hint?: string;
      details?: string;
      retryable?: boolean;
    };
  };
  const error = payload.error ?? {};
  const code = error.code ?? err.code;
  const safeError: Record<string, unknown> = {
    ...(code && { code }),
    ...(typeof error.message === "string" && { message: redactSensitiveText(error.message) }),
    ...(typeof error.hint === "string" && { hint: redactSensitiveText(error.hint) }),
    ...(typeof error.retryable === "boolean" && { retryable: error.retryable }),
  };
  if (typeof error.details === "string" && !SENSITIVE_ERROR_CODES.has(code)) {
    safeError.details = redactSensitiveText(error.details);
  }
  return {
    error: safeError,
  };
}

function wrapWithPrefix(text: string, prefix: string, width: number): string[] {
  const safeWidth = Math.max(20, width - prefix.length);
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === "")) return [prefix];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length === 0) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= safeWidth) {
      current += ` ${word}`;
    } else {
      lines.push(`${prefix}${current}`);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(`${prefix}${current}`);
  }

  return lines;
}

function supportsStderrStyling(): boolean {
  return (process.stderr.isTTY || forceColor) && !noColor;
}

export function setFlags(opts: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  debug?: boolean;
  reveal?: boolean;
  timeout?: number;
}) {
  forceJSON = opts.json ?? false;
  quiet = opts.quiet ?? false;
  verbose = opts.verbose ?? false;
  debugMode = opts.debug ?? false;
  reveal = opts.reveal ?? false;
  timeout = opts.timeout;
}

export function isRevealMode(): boolean {
  return reveal && Boolean(process.stdout.isTTY);
}

export function isJSONMode(): boolean {
  if (forceJSON) return true;
  return !process.stdout.isTTY;
}

export function printJSON(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printHuman(humanText: string, jsonValue: unknown): void {
  if (isJSONMode()) {
    printJSON(jsonValue);
  } else {
    process.stdout.write(humanText);
  }
}

export function printError(err: CLIError): void {
  if (isJSONMode()) {
    console.error(JSON.stringify(toSafeErrorJSON(err), null, 2));
  } else {
    const width = process.stderr.columns ?? 100;
    const safeMessage = redactSensitiveText(err.message);
    const safeHint = err.hint ? redactSensitiveText(err.hint) : undefined;
    const safeDetails = err.details ? redactSensitiveText(err.details) : undefined;
    const detailLines = safeDetails
      ? safeDetails
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      : [];
    const lines: string[] = [`  ✗ ${err.code}`, `  ${"─".repeat(40)}`];
    lines.push(...wrapWithPrefix(safeMessage, "  - ", width));
    if (detailLines.length > 0) {
      lines.push("");
      lines.push("  - Provider:");
      for (const line of detailLines) {
        lines.push(...wrapWithPrefix(line, "    - ", width));
      }
    }
    if (safeHint) {
      lines.push("");
      lines.push(...wrapWithPrefix(`Hint: ${safeHint}`, "  - ", width));
    }

    if (supportsStderrStyling()) {
      const styled = [
        `  ${ansi.red("✗")} ${ansi.boldRed(err.code)}`,
        `  ${ansi.dim("─".repeat(40))}`,
        ...wrapWithPrefix(safeMessage, "  - ", width).map((line) => ansi.red(line)),
      ];
      if (detailLines.length > 0) {
        styled.push("");
        styled.push(`  ${ansi.dim("- Provider:")}`);
        for (const line of detailLines) {
          styled.push(...wrapWithPrefix(line, "    - ", width).map((ln) => ansi.dim(ln)));
        }
      }
      if (safeHint) {
        styled.push("");
        styled.push(
          ...wrapWithPrefix(`Hint: ${safeHint}`, "  - ", width).map((line) => ansi.dim(line)),
        );
      }
      console.error(`\n${styled.join("\n")}\n`);
      return;
    }

    console.error(`\n${lines.join("\n")}\n`);
  }
}

export function formatCommanderError(message: string): string {
  // Commander errors fire before preAction, so forceJSON isn't set yet.
  // Check non-TTY and --json directly.
  const jsonMode = !process.stdout.isTTY || process.argv.includes("--json");

  const lines = message
    .trimEnd()
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return message;

  const [first, ...rest] = lines;
  const detail = first.replace(/^error:\s*/i, "").trim();

  if (jsonMode) {
    const err: Record<string, unknown> = {
      error: {
        code: "INVALID_ARGS",
        message: detail,
        ...(rest.length > 0 && { hint: rest.map((l) => l.trim()).join(" ") }),
      },
    };
    return JSON.stringify(err, null, 2) + "\n";
  }

  if (!supportsStderrStyling()) return message;

  const styled = [
    `  ${ansi.red("✗")} ${ansi.boldRed("Error")}`,
    `  ${ansi.red(detail)}`,
    ...rest.map((line) => `  ${ansi.dim(line)}`),
  ];
  return `\n${styled.join("\n")}\n`;
}

export function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    console.error(`[debug] ${message}`, ...args);
  }
}
