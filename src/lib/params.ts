import { errInvalidArgs } from "./errors.js";

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
