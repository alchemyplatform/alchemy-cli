import type { Command } from "commander";
import { stdin, stdout } from "node:process";
import { isJSONMode } from "./output.js";

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isNonInteractiveEnv(): boolean {
  return isTruthy(process.env.ALCHEMY_NON_INTERACTIVE);
}

export function isInteractiveAllowed(program?: Command): boolean {
  if (!stdin.isTTY || !stdout.isTTY) return false;
  if (isJSONMode()) return false;
  if (isNonInteractiveEnv()) return false;
  if (program && program.opts().interactive === false) return false;
  return true;
}
