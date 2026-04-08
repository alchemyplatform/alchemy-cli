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

async function hasAuthToken(cfg: Config): Promise<boolean> {
  return (await resolveAuthToken(cfg)) !== undefined;
}

export async function getSetupMethod(cfg: Config): Promise<SetupMethod | null> {
  if (hasAPIKey(cfg)) return "api_key";
  if (hasAccessKeyAndApp(cfg)) return "access_key_app";
  if (hasX402Wallet(cfg)) return "x402_wallet";
  if (await hasAuthToken(cfg)) return "auth_token";
  return null;
}

export async function isSetupComplete(cfg: Config): Promise<boolean> {
  return (await getSetupMethod(cfg)) !== null;
}

export async function getSetupStatus(cfg: Config): Promise<SetupStatus> {
  const satisfiedBy = await getSetupMethod(cfg);
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

export async function shouldRunOnboarding(program: Command, cfg: Config): Promise<boolean> {
  return isInteractiveAllowed(program) && !(await isSetupComplete(cfg));
}
