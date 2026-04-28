import type { Command } from "commander";
import { errInvalidArgs } from "./errors.js";

/**
 * Add the shared `--signer <type>` option to a tx command. Callers read
 * `opts.signer` in their action handler and pass the parsed value to
 * buildWalletClient via an explicit second argument — do NOT rely on
 * getCommandOptions to thread it through the root program instance.
 */
export function addSignerOption(cmd: Command): Command {
  return cmd.option("--signer <type>", "Signer to use: session | local");
}

export function parseSignerOpt(value: unknown): "session" | "local" | undefined {
  if (value === "session" || value === "local") return value;
  if (value === undefined || value === null || value === "") return undefined;
  throw errInvalidArgs("`--signer` must be 'session' or 'local'.");
}

export function parseCLIParams(params: string[]): unknown[] {
  return params.map((param) => {
    try {
      return JSON.parse(param);
    } catch {
      return param;
    }
  });
}

export function parseRequiredJSON<T>(input: string, label: string): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    throw errInvalidArgs(`Invalid JSON for ${label}.`);
  }
}

export function parseOptionalInt(
  value: string | undefined,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw errInvalidArgs(`${label} must be a non-negative integer.`);
  }
  return parsed;
}
