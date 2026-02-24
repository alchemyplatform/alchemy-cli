import { Command } from "commander";
import { load } from "./config.js";
import { Client } from "./client.js";
import { errAuthRequired } from "./errors.js";
import { debug } from "./output.js";

export function resolveAPIKey(program: Command): string {
  const opts = program.opts();
  if (opts.apiKey) return opts.apiKey;
  if (process.env.ALCHEMY_API_KEY) return process.env.ALCHEMY_API_KEY;
  const cfg = load();
  if (cfg.api_key) return cfg.api_key;
  throw errAuthRequired();
}

export function resolveNetwork(program: Command): string {
  const opts = program.opts();
  if (opts.network) return opts.network;
  if (process.env.ALCHEMY_NETWORK) return process.env.ALCHEMY_NETWORK;
  const cfg = load();
  if (cfg.network) return cfg.network;
  return "eth-mainnet";
}

export function clientFromFlags(program: Command): Client {
  const apiKey = resolveAPIKey(program);
  const network = resolveNetwork(program);
  debug(`using network=${network}`);
  return new Client(apiKey, network);
}
