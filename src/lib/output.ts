import { CLIError } from "./errors.js";

export let forceJSON = false;
export let quiet = false;
export let verbose = false;

export function setFlags(opts: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}) {
  forceJSON = opts.json ?? false;
  quiet = opts.quiet ?? false;
  verbose = opts.verbose ?? false;
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
    console.error(err.format());
  }
}

export function debug(message: string, ...args: unknown[]): void {
  if (verbose) {
    console.error(`[debug] ${message}`, ...args);
  }
}
