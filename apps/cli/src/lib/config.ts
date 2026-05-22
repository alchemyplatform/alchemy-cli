import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { z } from "zod";
import { maskIf } from "./secrets.js";

export interface AppConfig {
  id: string;
  name: string;
  apiKey: string;
  webhookApiKey?: string;
}

export interface Config {
  api_key?: string;
  access_key?: string;
  webhook_api_key?: string;
  app?: AppConfig;
  network?: string;
  verbose?: boolean;
  wallet_key_file?: string;
  wallet_address?: string;
  x402?: boolean;
  auth_token?: string;
  auth_token_expires_at?: string;
  siwe_token?: string;
  siwe_token_expires_at?: string;
  solana_wallet_key_file?: string;
  solana_wallet_address?: string;
  evm_gas_sponsored?: boolean;
  evm_gas_policy_id?: string;
  solana_fee_sponsored?: boolean;
  solana_fee_policy_id?: string;
  delegated_wallet?: boolean;
  active_signer?: "session" | "local";
  wallet_client_instance_id?: string;
  wallet_client_instance_name?: string;
}

export const KEY_MAP: Record<string, keyof Config> = {
  "api-key": "api_key",
  api_key: "api_key",
  "access-key": "access_key",
  access_key: "access_key",
  "webhook-api-key": "webhook_api_key",
  webhook_api_key: "webhook_api_key",
  network: "network",
  verbose: "verbose",
  "wallet-key-file": "wallet_key_file",
  wallet_key_file: "wallet_key_file",
  "wallet-address": "wallet_address",
  wallet_address: "wallet_address",
  x402: "x402",
  "auth-token": "auth_token",
  auth_token: "auth_token",
  "auth-token-expires-at": "auth_token_expires_at",
  auth_token_expires_at: "auth_token_expires_at",
  "solana-wallet-key-file": "solana_wallet_key_file",
  solana_wallet_key_file: "solana_wallet_key_file",
  "solana-wallet-address": "solana_wallet_address",
  solana_wallet_address: "solana_wallet_address",
  "evm-gas-sponsored": "evm_gas_sponsored",
  evm_gas_sponsored: "evm_gas_sponsored",
  "evm-gas-policy-id": "evm_gas_policy_id",
  evm_gas_policy_id: "evm_gas_policy_id",
  "solana-fee-sponsored": "solana_fee_sponsored",
  solana_fee_sponsored: "solana_fee_sponsored",
  "solana-fee-policy-id": "solana_fee_policy_id",
  solana_fee_policy_id: "solana_fee_policy_id",
  "delegated-wallet": "delegated_wallet",
  delegated_wallet: "delegated_wallet",
  "active-signer": "active_signer",
  active_signer: "active_signer",
  "wallet-client-instance-name": "wallet_client_instance_name",
  wallet_client_instance_name: "wallet_client_instance_name",
};

const SAFE_ID_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const SAFE_NETWORK_RE = /^[A-Za-z0-9:_-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SECRET_LEN = 512;
const MAX_APP_NAME_LEN = 128;
const MAX_WALLET_CLIENT_INSTANCE_NAME_LEN = 64;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const WALLET_CLIENT_INSTANCE_ID_NAMESPACE = "alchemy-cli:wallet-client-instance-name:v1";

const safeTextSchema = (maxLen: number) =>
  z
    .string()
    .min(1)
    .max(maxLen)
    // Reject control characters to avoid writing unexpected multi-line/binary-like values.
    .refine((value) => !CONTROL_CHAR_RE.test(value));

const appConfigSchema = z
  .object({
    id: z.string().regex(SAFE_ID_RE),
    name: safeTextSchema(MAX_APP_NAME_LEN),
    apiKey: safeTextSchema(MAX_SECRET_LEN),
    webhookApiKey: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
  })
  .strip();

const MAX_PATH_LEN = 4096;

const configSchema = z
  .object({
    api_key: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    access_key: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    webhook_api_key: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    app: appConfigSchema.optional().catch(undefined),
    network: z.string().regex(SAFE_NETWORK_RE).optional().catch(undefined),
    verbose: z.boolean().optional().catch(undefined),
    wallet_key_file: safeTextSchema(MAX_PATH_LEN).optional().catch(undefined),
    wallet_address: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    x402: z.boolean().optional().catch(undefined),
    auth_token: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    auth_token_expires_at: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    siwe_token: safeTextSchema(MAX_PATH_LEN).optional().catch(undefined),
    siwe_token_expires_at: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    solana_wallet_key_file: safeTextSchema(MAX_PATH_LEN).optional().catch(undefined),
    solana_wallet_address: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    evm_gas_sponsored: z.boolean().optional().catch(undefined),
    evm_gas_policy_id: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    solana_fee_sponsored: z.boolean().optional().catch(undefined),
    solana_fee_policy_id: safeTextSchema(MAX_SECRET_LEN).optional().catch(undefined),
    delegated_wallet: z.boolean().optional().catch(undefined),
    active_signer: z.enum(["session", "local"]).optional().catch(undefined),
    wallet_client_instance_id: z.string().regex(UUID_RE).optional().catch(undefined),
    wallet_client_instance_name: z
      .string()
      .transform(normalizeWhitespace)
      .pipe(safeTextSchema(MAX_WALLET_CLIENT_INSTANCE_NAME_LEN))
      .optional()
      .catch(undefined),
  })
  .strip();

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeConfig(input: unknown): Config {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

// Normalize legacy `delegated_wallet: true` → `active_signer: "session"` on read.
// Pure in-memory transform: no disk writes happen here. The persisted migration
// completes on the next config.save() via the scrub-on-save logic below.
function applyLegacyMigration(cfg: Config): Config {
  if (cfg.active_signer === undefined && cfg.delegated_wallet === true) {
    const { delegated_wallet: _, ...rest } = cfg;
    return { ...rest, active_signer: "session" };
  }
  return cfg;
}

function getHome(): string {
  return process.env.HOME || homedir();
}

export function configPath(): string {
  if (process.env.ALCHEMY_CONFIG) return process.env.ALCHEMY_CONFIG;
  const configHome = process.env.XDG_CONFIG_HOME || join(getHome(), ".config");
  return join(configHome, "alchemy", "config.json");
}

export function configDir(): string {
  return dirname(configPath());
}

export function load(): Config {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    const data = readFileSync(p, "utf-8");
    return applyLegacyMigration(sanitizeConfig(JSON.parse(data)));
  } catch {
    console.error(`warning: could not parse config file at ${p} — using defaults`);
    return {};
  }
}

export function save(cfg: Config): void {
  const p = configPath();
  const sanitized = sanitizeConfig(cfg);
  // Unconditionally strip legacy `delegated_wallet` on write. Belt-and-suspenders
  // alongside load-time normalization — guards call sites that hand-construct a
  // Config and still somehow include the legacy field.
  delete sanitized.delegated_wallet;
  mkdirSync(dirname(p), { recursive: true, mode: 0o755 });
  writeFileSync(p, JSON.stringify(sanitized, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function getOrCreateWalletClientInstanceId(): string {
  return getOrCreateWalletClientInstance().id;
}

export interface WalletClientInstance {
  id: string;
  name?: string;
}

export function normalizeWalletClientInstanceName(value: string): string | undefined {
  const normalized = normalizeWhitespace(value);
  const parsed = safeTextSchema(MAX_WALLET_CLIENT_INSTANCE_NAME_LEN).safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function deriveWalletClientInstanceIdFromName(name: string): string {
  const normalized = normalizeWalletClientInstanceName(name);
  if (normalized === undefined) {
    throw new Error("Invalid wallet client instance name.");
  }
  const digest = createHash("sha256")
    .update(WALLET_CLIENT_INSTANCE_ID_NAMESPACE)
    .update("\0")
    .update(normalized.toLowerCase())
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function getOrCreateWalletClientInstance(input: {
  instanceName?: string;
} = {}): WalletClientInstance {
  const cfg = load();
  const instanceName =
    input.instanceName === undefined
      ? cfg.wallet_client_instance_name
      : normalizeWalletClientInstanceName(input.instanceName);

  if (input.instanceName !== undefined && instanceName === undefined) {
    throw new Error("Invalid wallet client instance name.");
  }

  if (instanceName !== undefined) {
    const walletClientInstanceId = deriveWalletClientInstanceIdFromName(instanceName);
    save({
      ...cfg,
      wallet_client_instance_id: walletClientInstanceId,
      wallet_client_instance_name: instanceName,
    });
    return {
      id: walletClientInstanceId,
      name: instanceName,
    };
  }

  if (cfg.wallet_client_instance_id) {
    return { id: cfg.wallet_client_instance_id };
  }

  const walletClientInstanceId = randomUUID();
  save({
    ...cfg,
    wallet_client_instance_id: walletClientInstanceId,
  });
  return { id: walletClientInstanceId };
}

export function get(cfg: Config, key: string): string | undefined {
  if (key === "app") {
    if (!cfg.app) return undefined;
    return `${cfg.app.name} (${cfg.app.id})`;
  }
  const mapped = KEY_MAP[key];
  if (!mapped) return undefined;
  const value = cfg[mapped];
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return undefined;
}

export function set(
  cfg: Config,
  key: string,
  value: string,
): { ok: boolean; config: Config } {
  const mapped = KEY_MAP[key];
  if (!mapped) return { ok: false, config: cfg };
  if (
    mapped === "verbose" ||
    mapped === "x402" ||
    mapped === "evm_gas_sponsored" ||
    mapped === "solana_fee_sponsored" ||
    mapped === "delegated_wallet"
  ) {
    const normalized = value.trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      return { ok: false, config: cfg };
    }
    return { ok: true, config: { ...cfg, [mapped]: normalized === "true" } };
  }
  if (mapped === "active_signer") {
    const normalized = value.trim().toLowerCase();
    if (normalized !== "session" && normalized !== "local") {
      return { ok: false, config: cfg };
    }
    return { ok: true, config: { ...cfg, active_signer: normalized } };
  }
  return { ok: true, config: { ...cfg, [mapped]: value } };
}

export function validKeys(): string[] {
  return [
    "api-key",
    "access-key",
    "webhook-api-key",
    "network",
    "verbose",
    "wallet-key-file",
    "x402",
    "evm-gas-sponsored",
    "evm-gas-policy-id",
    "solana-fee-sponsored",
    "solana-fee-policy-id",
  ];
}

export function toMap(cfg: Config): Record<string, string> {
  const m: Record<string, string> = {};
  if (cfg.api_key) m["api-key"] = maskIf(cfg.api_key);
  if (cfg.access_key) m["access-key"] = maskIf(cfg.access_key);
  if (cfg.webhook_api_key) m["webhook-api-key"] = maskIf(cfg.webhook_api_key);
  if (cfg.app) m["app"] = `${cfg.app.name} (${cfg.app.id})`;
  if (cfg.network) m["network"] = cfg.network;
  if (cfg.verbose !== undefined) m["verbose"] = String(cfg.verbose);
  if (cfg.wallet_key_file) m["wallet-key-file"] = cfg.wallet_key_file;
  if (cfg.wallet_address) m["wallet-address"] = cfg.wallet_address;
  if (cfg.x402 !== undefined) m["x402"] = String(cfg.x402);
  if (cfg.auth_token) m["auth-token"] = maskIf(cfg.auth_token);
  if (cfg.auth_token_expires_at) m["auth-token-expires-at"] = cfg.auth_token_expires_at;
  if (cfg.solana_wallet_key_file) m["solana-wallet-key-file"] = cfg.solana_wallet_key_file;
  if (cfg.solana_wallet_address) m["solana-wallet-address"] = cfg.solana_wallet_address;
  if (cfg.evm_gas_sponsored !== undefined) m["evm-gas-sponsored"] = String(cfg.evm_gas_sponsored);
  if (cfg.evm_gas_policy_id) m["evm-gas-policy-id"] = cfg.evm_gas_policy_id;
  if (cfg.solana_fee_sponsored !== undefined) m["solana-fee-sponsored"] = String(cfg.solana_fee_sponsored);
  if (cfg.solana_fee_policy_id) m["solana-fee-policy-id"] = cfg.solana_fee_policy_id;
  if (cfg.active_signer !== undefined) m["active-signer"] = cfg.active_signer;
  return m;
}
