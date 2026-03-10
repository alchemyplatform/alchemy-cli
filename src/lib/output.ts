// Re-export from split modules for backward compatibility
export { printError, formatCommanderError, supportsStderrStyling } from "./error-format.js";
export {
  redactSensitiveText,
  redactAfterMarker,
  isSecretBoundaryChar,
  ALCHEMY_KEY_PATH_MARKERS,
  SENSITIVE_ERROR_CODES,
} from "./redact.js";

export let forceJSON = false;
export let quiet = false;
export let verbose = false;
export let debugMode = false;
export let timeout: number | undefined;
let reveal = false;

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

export function debug(message: string, ...args: unknown[]): void {
  if (debugMode) {
    console.error(`[debug] ${message}`, ...args);
  }
}
