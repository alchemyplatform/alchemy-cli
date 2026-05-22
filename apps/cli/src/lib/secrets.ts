import { isRevealMode } from "./output.js";

export function maskSecret(value: string): string {
  if (value.length <= 8) return "\u2022".repeat(value.length);
  return value.slice(0, 4) + "\u2022".repeat(value.length - 8) + value.slice(-4);
}

export function maskIf(value: string): string {
  return isRevealMode() ? value : maskSecret(value);
}
