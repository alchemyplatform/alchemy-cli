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
import { debug } from "./output.js";

export function resolveAPIKey(program: Command, cfg?: Config): string | undefined {
  const opts = program.opts();
  if (opts.apiKey) return opts.apiKey;
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  const config = cfg ?? load();
  if (config.api_key) return config.api_key;
  // Fallback: use the API key from the configured app
  if (config.app?.apiKey) return config.app.apiKey;
  return undefined;
}

export function resolveAccessKey(program: Command, cfg?: Config): string | undefined {
  const opts = program.opts();
  if (opts.accessKey) return opts.accessKey;
  if (process.env.ALCHEMY_ACCESS_KEY) return process.env.ALCHEMY_ACCESS_KEY;
  const config = cfg ?? load();
  if (config.access_key) return config.access_key;
  return undefined;
}

export function resolveNetwork(program: Command, cfg?: Config, defaultNetwork?: string): string {
  const opts = program.opts();
  if (opts.network) return opts.network;
  if (process.env.ALCHEMY_NETWORK) return process.env.ALCHEMY_NETWORK;
  const config = cfg ?? load();
  if (config.network) return config.network;
  return defaultNetwork ?? "eth-mainnet";
}

export function resolveAppId(program: Command, cfg?: Config): string | undefined {
  const opts = program.opts();
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
  const opts = program.opts();
  if (opts.x402) return true;
  const config = cfg ?? load();
  return config.x402 === true;
}

export function resolveX402Client(program: Command): X402Client | null {
  const cfg = load();
  if (!resolveX402(program, cfg)) return null;
  const walletKey = resolveWalletKey(program, cfg);
  if (!walletKey) return null;
  return new X402Client(walletKey, resolveNetwork(program, cfg));
}

export function resolveWalletKey(program: Command, cfg?: Config): string | undefined {
  const opts = program.opts();

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

export function clientFromFlags(program: Command, opts?: { defaultNetwork?: string }): AlchemyClient {
  const cfg = load();
  const network = resolveNetwork(program, cfg, opts?.defaultNetwork);
  debug(`using network=${network}`);

  // Reject --access-key on RPC commands — it's only for admin commands
  const programOpts = program.opts();
  if (programOpts.accessKey) {
    throw errInvalidArgs(
      "--access-key is for admin commands (apps, chains, webhooks). Use --api-key for RPC commands.",
    );
  }

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
