import type { Config } from "./config.js";
import type { Command } from "commander";
import { isInteractiveAllowed } from "./interaction.js";
import { resolveAuthToken } from "./resolve.js";

export type SetupMethod = "api_key" | "access_key_app" | "x402_wallet" | "auth_token";

export interface SetupStatus {
  complete: boolean;
  satisfiedBy: SetupMethod | null;
  missing: string[];
  nextCommands: string[];
}

function hasAPIKey(cfg: Config): boolean {
  return Boolean(cfg.api_key?.trim());
}

function hasAccessKeyAndApp(cfg: Config): boolean {
  return Boolean(cfg.access_key?.trim() && cfg.app?.id && cfg.app.apiKey);
}

function hasX402Wallet(cfg: Config): boolean {
  return cfg.x402 === true && Boolean(cfg.wallet_key_file?.trim());
}

function hasAuthTokenAndApp(cfg: Config): boolean {
  // Auth token alone is not enough for RPC commands — they need an API key,
  // which comes from having a selected app. Without an app, non-interactive
  // commands fail with AUTH_REQUIRED despite isSetupComplete returning true.
  return resolveAuthToken(cfg) !== undefined && Boolean(cfg.app?.apiKey);
}

export function getSetupMethod(cfg: Config): SetupMethod | null {
  if (hasAPIKey(cfg)) return "api_key";
  if (hasAccessKeyAndApp(cfg)) return "access_key_app";
  if (hasX402Wallet(cfg)) return "x402_wallet";
  if (hasAuthTokenAndApp(cfg)) return "auth_token";
  return null;
}

export function isSetupComplete(cfg: Config): boolean {
  return getSetupMethod(cfg) !== null;
}

export function getSetupStatus(cfg: Config): SetupStatus {
  const satisfiedBy = getSetupMethod(cfg);
  if (satisfiedBy) {
    return {
      complete: true,
      satisfiedBy,
      missing: [],
      nextCommands: [],
    };
  }

  return {
    complete: false,
    satisfiedBy: null,
    missing: ["Provide one auth path: alchemy auth OR api-key OR access-key+app OR SIWx wallet"],
    nextCommands: [
      "alchemy auth",
      "alchemy config set api-key <key>",
      "alchemy config set access-key <key> && alchemy config set app <app-id>",
      "alchemy wallet generate && alchemy config set x402 true",
    ],
  };
}

export function shouldRunOnboarding(program: Command, cfg: Config): boolean {
  return isInteractiveAllowed(program) && !isSetupComplete(cfg);
}
