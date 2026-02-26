import { CLIError } from "./errors.js";

export let forceJSON = false;
export let quiet = false;
export let verbose = false;
export let debugMode = false;
let reveal = false;
const forceColor = "FORCE_COLOR" in process.env && process.env.FORCE_COLOR !== "0";
const noColor = !forceColor && "NO_COLOR" in process.env;
const ansi = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  boldRed: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function supportsStderrStyling(): boolean {
  return (process.stderr.isTTY || forceColor) && !noColor;
}

export function setFlags(opts: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  debug?: boolean;
  reveal?: boolean;
}) {
  forceJSON = opts.json ?? false;
  quiet = opts.quiet ?? false;
  verbose = opts.verbose ?? false;
  debugMode = opts.debug ?? false;
  reveal = opts.reveal ?? false;
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
    console.error(JSON.stringify(err.toJSON(), null, 2));
  } else {
    const lines = [`  ✗ ${err.code}`, `  ${err.message}`];
    if (err.hint) lines.push(`  Hint: ${err.hint}`);

    if (supportsStderrStyling()) {
      const styled = [
        `  ${ansi.red("✗")} ${ansi.boldRed(err.code)}`,
        `  ${ansi.red(err.message)}`,
      ];
      if (err.hint) styled.push(`  ${ansi.dim(`Hint: ${err.hint}`)}`);
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
