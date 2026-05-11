import type { Config } from "./config.js";
import type { Command } from "commander";
import { isInteractiveAllowed } from "./interaction.js";
import { resolveAuthToken, resolveWalletSession } from "./resolve.js";

export type SetupMethod = "api_key" | "access_key_app" | "x402_wallet" | "auth_token";
export type SetupCapability =
  | "rpc_data"
  | "admin_api"
  | "notify_webhooks"
  | "wallet_signing"
  | "x402";

export interface CapabilityStatus {
  complete: boolean;
  satisfiedBy: string | null;
  missing: string[];
  nextCommands: string[];
}

export type SetupCapabilities = Record<SetupCapability, CapabilityStatus>;

export const SETUP_CAPABILITY_ORDER: SetupCapability[] = [
  "rpc_data",
  "admin_api",
  "notify_webhooks",
  "wallet_signing",
  "x402",
];

export const SETUP_CAPABILITY_LABELS: Record<SetupCapability, string> = {
  rpc_data: "RPC/data",
  admin_api: "Admin API",
  notify_webhooks: "Notify/webhooks",
  wallet_signing: "Wallet signing",
  x402: "x402",
};

export interface SetupStatus {
  complete: boolean;
  satisfiedBy: SetupMethod | null;
  missing: string[];
  nextCommands: string[];
  capabilities: SetupCapabilities;
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

function hasAuthToken(cfg: Config): boolean {
  return resolveAuthToken(cfg) !== undefined;
}

function capabilityStatus(args: {
  complete: boolean;
  satisfiedBy: string | null;
  missing: string[];
  nextCommands: string[];
}): CapabilityStatus {
  return args;
}

export function getSetupCapabilities(cfg: Config): SetupCapabilities {
  const hasConfiguredAPIKey = hasAPIKey(cfg) || Boolean(cfg.app?.apiKey?.trim());
  const hasAdminAuth = Boolean(cfg.access_key?.trim()) || hasAuthToken(cfg);
  const hasNotifyAuth = Boolean(
    cfg.webhook_api_key?.trim() || cfg.app?.webhookApiKey?.trim(),
  );
  const hasLocalWallet = Boolean(
    cfg.wallet_key_file?.trim() || cfg.solana_wallet_key_file?.trim(),
  );
  const hasSessionWallet = resolveWalletSession() !== null && hasAuthToken(cfg);
  const x402Ready = hasX402Wallet(cfg);

  return {
    rpc_data: capabilityStatus({
      complete: hasConfiguredAPIKey || x402Ready,
      satisfiedBy: hasConfiguredAPIKey ? "api_key" : x402Ready ? "x402_wallet" : null,
      missing: hasConfiguredAPIKey || x402Ready ? [] : ["api-key or x402 wallet"],
      nextCommands: hasConfiguredAPIKey || x402Ready
        ? []
        : ["alchemy config set app", "alchemy config set api-key <key>"],
    }),
    admin_api: capabilityStatus({
      complete: hasAdminAuth,
      satisfiedBy: cfg.access_key?.trim()
        ? "access_key"
        : hasAuthToken(cfg)
          ? "auth_token"
          : null,
      missing: hasAdminAuth ? [] : ["access-key or auth token"],
      nextCommands: hasAdminAuth
        ? []
        : ["alchemy auth", "alchemy config set access-key <key>"],
    }),
    notify_webhooks: capabilityStatus({
      complete: hasNotifyAuth,
      satisfiedBy: cfg.webhook_api_key?.trim()
        ? "webhook-api-key"
        : cfg.app?.webhookApiKey?.trim()
          ? "configured app webhook key"
          : null,
      missing: hasNotifyAuth ? [] : ["webhook API key"],
      nextCommands: hasNotifyAuth
        ? []
        : ["alchemy config set webhook-api-key <key>", "alchemy config set app"],
    }),
    wallet_signing: capabilityStatus({
      complete: hasLocalWallet || hasSessionWallet,
      satisfiedBy: hasSessionWallet
        ? "wallet_session"
        : hasLocalWallet
          ? "local_wallet"
          : null,
      missing: hasLocalWallet || hasSessionWallet ? [] : ["wallet signer"],
      nextCommands: hasLocalWallet || hasSessionWallet
        ? []
        : [
            "alchemy wallet connect",
            "alchemy wallet connect --mode local --chain evm",
          ],
    }),
    x402: capabilityStatus({
      complete: x402Ready,
      satisfiedBy: x402Ready ? "x402_wallet" : null,
      missing: x402Ready ? [] : ["x402 enabled with wallet key file"],
      nextCommands: x402Ready
        ? []
        : ["alchemy wallet connect --mode local --chain evm && alchemy config set x402 true"],
    }),
  };
}

export function getSetupMethod(cfg: Config): SetupMethod | null {
  if (hasAPIKey(cfg)) return "api_key";
  if (hasAccessKeyAndApp(cfg)) return "access_key_app";
  if (hasX402Wallet(cfg)) return "x402_wallet";
  if (hasAuthToken(cfg)) return "auth_token";
  return null;
}

export function isSetupComplete(cfg: Config): boolean {
  return getSetupMethod(cfg) !== null;
}

export function getSetupStatus(cfg: Config): SetupStatus {
  const satisfiedBy = getSetupMethod(cfg);
  const capabilities = getSetupCapabilities(cfg);
  if (satisfiedBy) {
    return {
      complete: true,
      satisfiedBy,
      missing: [],
      nextCommands: [],
      capabilities,
    };
  }

  return {
    complete: false,
    satisfiedBy: null,
    missing: ["Provide one auth path: alchemy auth OR api-key OR ALCHEMY_ACCESS_KEY+app OR SIWx wallet"],
    nextCommands: [
      "alchemy auth",
      "alchemy config set app",
      "alchemy config set access-key <key> && alchemy config set app <app-id>",
      "alchemy wallet connect --mode local --chain evm && alchemy config set x402 true",
    ],
    capabilities,
  };
}

export function shouldRunOnboarding(program: Command, cfg: Config): boolean {
  return isInteractiveAllowed(program) && !isSetupComplete(cfg);
}
