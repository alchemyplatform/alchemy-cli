import { Command } from "commander";
import { load } from "./config.js";
import { Client } from "./client.js";
import { AdminClient } from "./admin-client.js";
import { errAuthRequired, errAccessKeyRequired } from "./errors.js";
import { debug } from "./output.js";

export function resolveAPIKey(program: Command): string | undefined {
  const opts = program.opts();
  if (opts.apiKey) return opts.apiKey;
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  const cfg = load();
  if (cfg.api_key) return cfg.api_key;
  // Fallback: use the API key from the configured app
  if (cfg.app?.apiKey) return cfg.app.apiKey;
  return undefined;
}

export function resolveAccessKey(program: Command): string | undefined {
  const opts = program.opts();
  if (opts.accessKey) return opts.accessKey;
  if (process.env.ALCHEMY_ACCESS_KEY) return process.env.ALCHEMY_ACCESS_KEY;
  const cfg = load();
  if (cfg.access_key) return cfg.access_key;
  return undefined;
}

export function resolveNetwork(program: Command): string {
  const opts = program.opts();
  if (opts.network) return opts.network;
  if (process.env.ALCHEMY_NETWORK) return process.env.ALCHEMY_NETWORK;
  const cfg = load();
  if (cfg.network) return cfg.network;
  return "eth-mainnet";
}

export function adminClientFromFlags(program: Command): AdminClient {
  const accessKey = resolveAccessKey(program);
  if (!accessKey) throw errAccessKeyRequired();
  return new AdminClient(accessKey);
}

export function clientFromFlags(program: Command): Client {
  const apiKey = resolveAPIKey(program);
  if (!apiKey) throw errAuthRequired();

  const network = resolveNetwork(program);
  debug(`using network=${network}`);
  return new Client(apiKey, network);
}
