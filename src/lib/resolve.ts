import { readFileSync } from "node:fs";
import { Command } from "commander";
import { load } from "./config.js";
import type { Config } from "./config.js";
import type { AlchemyClient } from "./client-interface.js";
import { getBaseDomain } from "./client-utils.js";
import { Client } from "./client.js";
import { X402Client } from "./x402-client.js";
import { AdminClient } from "./admin-client.js";
import { errAppRequired, errAuthRequired, errAccessKeyRequired, errInvalidArgs, errWalletKeyRequired } from "./errors.js";
import { isSolanaNetwork } from "./networks.js";
import { debug } from "./output.js";
import { loadSession, isSessionValid, type WalletSession } from "./wallet-session.js";

interface CommandOptions {
  apiKey?: string;
  network?: string;
  appId?: string;
  x402?: boolean;
  walletKeyFile?: string;
  solanaWalletKeyFile?: string;
  gasSponsored?: boolean;
  gasPolicyId?: string;
  feeSponsored?: boolean;
  feePolicyId?: string;
  delegatedWallet?: boolean;
  signer?: string;
}

function getCommandOptions(program: Command): CommandOptions {
  const commandWithGlobals = program as Command & {
    optsWithGlobals?: () => CommandOptions;
  };
  return commandWithGlobals.optsWithGlobals?.() ?? program.opts();
}

export function resolveAPIKey(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);
  if (opts.apiKey) return opts.apiKey;
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  const config = cfg ?? load();
  if (config.api_key) return config.api_key;
  // Fallback: use the API key from the configured app
  if (config.app?.apiKey) return config.app.apiKey;
  return undefined;
}

export function resolveAccessKey(_program: Command, cfg?: Config): string | undefined {
  if (process.env.ALCHEMY_ACCESS_KEY) return process.env.ALCHEMY_ACCESS_KEY;
  const config = cfg ?? load();
  if (config.access_key) return config.access_key;
  return undefined;
}

export function resolveNetwork(program: Command, cfg?: Config, defaultNetwork?: string): string {
  const opts = getCommandOptions(program);
  if (opts.network) return opts.network;
  if (process.env.ALCHEMY_NETWORK) return process.env.ALCHEMY_NETWORK;
  const config = cfg ?? load();
  if (config.network) return config.network;
  return defaultNetwork ?? "eth-mainnet";
}

export function resolveSolanaNetwork(program: Command, cfg?: Config): string {
  const opts = getCommandOptions(program);
  if (opts.network) {
    if (!isSolanaNetwork(opts.network)) {
      throw errInvalidArgs(
        `Network '${opts.network}' is not a Solana network. Use a solana-* network with the solana namespace.`,
      );
    }
    return opts.network;
  }

  if (process.env.ALCHEMY_NETWORK) {
    if (!isSolanaNetwork(process.env.ALCHEMY_NETWORK)) {
      throw errInvalidArgs(
        `ALCHEMY_NETWORK='${process.env.ALCHEMY_NETWORK}' is not a Solana network. Use a solana-* network with the solana namespace.`,
      );
    }
    return process.env.ALCHEMY_NETWORK;
  }

  const config = cfg ?? load();
  if (config.network && isSolanaNetwork(config.network)) {
    return config.network;
  }

  return "solana-mainnet";
}

export function resolveAppId(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);
  if (opts.appId) return opts.appId;
  const config = cfg ?? load();
  if (config.app?.id) return config.app.id;
  return undefined;
}

export function resolveAuthToken(cfg?: Config): string | undefined {
  const config = cfg ?? load();
  if (!config.auth_token?.trim()) return undefined;
  // Check expiry
  if (config.auth_token_expires_at) {
    const expiry = new Date(config.auth_token_expires_at);
    if (!Number.isNaN(expiry.getTime()) && expiry <= new Date()) {
      return undefined;
    }
  }
  return config.auth_token;
}

export function adminClientFromFlags(program: Command): AdminClient {
  const cfg = load();
  const accessKey = resolveAccessKey(program, cfg);
  if (accessKey) return new AdminClient(accessKey);

  const authToken = resolveAuthToken(cfg);
  if (authToken) return new AdminClient({ type: "auth_token", token: authToken });

  throw errAccessKeyRequired();
}

export function resolveX402(program: Command, cfg?: Config): boolean {
  const opts = getCommandOptions(program);
  if (opts.x402) return true;
  const config = cfg ?? load();
  return config.x402 === true;
}

export function resolveX402Client(program: Command): X402Client | null {
  const cfg = load();
  if (!resolveX402(program, cfg)) return null;
  // NOTE: x402/SIWE authentication uses the local EVM key directly and is not
  // routed through the `active_signer` preference model. SIWX/x402 decoupling
  // from `alchemy wallet` is tracked in a sibling workstream — see AX-232.
  const walletKey = resolveWalletKey(program, cfg);
  if (!walletKey) return null;
  return new X402Client(walletKey, resolveNetwork(program, cfg));
}

export function resolveWalletKey(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);

  // 1. --wallet-key-file flag
  if (opts.walletKeyFile) {
    return readFileSync(opts.walletKeyFile, "utf-8").trim();
  }

  // 2. ALCHEMY_WALLET_KEY env var
  if (process.env.ALCHEMY_WALLET_KEY) {
    return process.env.ALCHEMY_WALLET_KEY;
  }

  // 3. Config wallet_key_file
  const config = cfg ?? load();
  if (config.wallet_key_file) {
    return readFileSync(config.wallet_key_file, "utf-8").trim();
  }

  return undefined;
}

export function resolveSolanaWalletKey(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);

  if (opts.solanaWalletKeyFile) {
    return readFileSync(opts.solanaWalletKeyFile, "utf-8").trim();
  }

  if (process.env.ALCHEMY_SOLANA_WALLET_KEY) {
    return process.env.ALCHEMY_SOLANA_WALLET_KEY;
  }

  const config = cfg ?? load();
  if (config.solana_wallet_key_file) {
    return readFileSync(config.solana_wallet_key_file, "utf-8").trim();
  }

  return undefined;
}

export function resolveGasSponsored(program: Command, cfg?: Config): boolean {
  const opts = getCommandOptions(program);
  if (opts.gasSponsored) return true;
  if (process.env.ALCHEMY_EVM_GAS_SPONSORED) {
    return process.env.ALCHEMY_EVM_GAS_SPONSORED.trim().toLowerCase() === "true";
  }
  const config = cfg ?? load();
  return config.evm_gas_sponsored === true;
}

export function resolveGasPolicyId(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);
  if (opts.gasPolicyId) return opts.gasPolicyId;
  if (process.env.ALCHEMY_EVM_GAS_POLICY_ID) return process.env.ALCHEMY_EVM_GAS_POLICY_ID;
  const config = cfg ?? load();
  return config.evm_gas_policy_id;
}

export function resolveSolanaFeeSponsored(program: Command, cfg?: Config): boolean {
  const opts = getCommandOptions(program);
  if (opts.feeSponsored) return true;
  if (process.env.ALCHEMY_SOLANA_FEE_SPONSORED) {
    return process.env.ALCHEMY_SOLANA_FEE_SPONSORED.trim().toLowerCase() === "true";
  }
  const config = cfg ?? load();
  return config.solana_fee_sponsored === true;
}

export function resolveSolanaFeePolicyId(program: Command, cfg?: Config): string | undefined {
  const opts = getCommandOptions(program);
  if (opts.feePolicyId) return opts.feePolicyId;
  if (process.env.ALCHEMY_SOLANA_FEE_POLICY_ID) return process.env.ALCHEMY_SOLANA_FEE_POLICY_ID;
  const config = cfg ?? load();
  return config.solana_fee_policy_id;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return undefined;
}

/**
 * Resolve the user's active-signer preference for EVM signing.
 *
 * Precedence (highest first):
 *   1. --signer flag (per-command override; string "session" | "local")
 *   2. ALCHEMY_ACTIVE_SIGNER env var
 *   3. config.active_signer
 *   4. Legacy env var ALCHEMY_DELEGATED_WALLET=true → "session"
 *
 * The legacy config field `delegated_wallet: true` is already normalized to
 * `active_signer: "session"` at config.load() time, so we do not read it here.
 *
 * Returns undefined when no preference is set — callers fall back to the
 * default policy ("session if a valid session exists, else local").
 */
export function resolveActiveSigner(
  program: Command,
  cfg?: Config,
): "session" | "local" | undefined {
  const opts = getCommandOptions(program);
  if (opts.signer === "session" || opts.signer === "local") {
    return opts.signer;
  }

  const env = process.env.ALCHEMY_ACTIVE_SIGNER;
  if (env === "session" || env === "local") {
    return env;
  }

  const config = cfg ?? load();
  if (config.active_signer === "session" || config.active_signer === "local") {
    return config.active_signer;
  }

  if (process.env.ALCHEMY_DELEGATED_WALLET !== undefined) {
    const parsed = parseBoolean(process.env.ALCHEMY_DELEGATED_WALLET);
    if (parsed === true) return "session";
  }

  return undefined;
}

/**
 * @deprecated Use resolveActiveSigner instead. Retained as a thin wrapper for
 * any call site that still asks "is delegated mode on?" — returns true only
 * when the user explicitly prefers session signing.
 */
export function resolveDelegatedMode(program: Command, cfg?: Config): boolean {
  return resolveActiveSigner(program, cfg) === "session";
}

export function clientFromFlags(
  program: Command,
  opts?: { defaultNetwork?: string; forceNetwork?: string },
): AlchemyClient {
  const cfg = load();
  const network = opts?.forceNetwork ?? resolveNetwork(program, cfg, opts?.defaultNetwork);
  debug(`using network=${network}`);

  if (resolveX402(program, cfg)) {
    const walletKey = resolveWalletKey(program, cfg);
    if (!walletKey) throw errWalletKeyRequired();
    return new X402Client(walletKey, network);
  }

  const apiKey = resolveAPIKey(program, cfg);
  if (!apiKey) throw errAuthRequired();
  return new Client(apiKey, network);
}

function appNetworkToSlug(rpcUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    return null;
  }

  const suffix = `.g.${getBaseDomain()}`;
  if (!parsed.hostname.endsWith(suffix)) return null;

  const slug = parsed.hostname.slice(0, -suffix.length);
  return slug || null;
}

export async function resolveConfiguredNetworkSlugs(
  program: Command,
  appIdOverride?: string,
): Promise<string[]> {
  const appId = appIdOverride || resolveAppId(program);
  if (!appId) throw errAppRequired();

  const admin = adminClientFromFlags(program);
  const app = await admin.getApp(appId);
  const slugs = app.chainNetworks
    .map((network) => appNetworkToSlug(network.rpcUrl))
    .filter((slug): slug is string => Boolean(slug));
  return Array.from(new Set(slugs)).sort((a, b) => a.localeCompare(b));
}

export function resolveWalletSession(): WalletSession | null {
  const session = loadSession();
  if (!session) return null;
  if (!isSessionValid(session)) return null;
  return session;
}

/** @deprecated Renamed to resolveWalletSession. Kept as an alias for one release. */
export const resolveDelegatedSession = resolveWalletSession;
