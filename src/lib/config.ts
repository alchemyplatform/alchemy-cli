import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface Config {
  api_key?: string;
  network?: string;
}

const KEY_MAP: Record<string, keyof Config> = {
  "api-key": "api_key",
  api_key: "api_key",
  network: "network",
};

function getHome(): string {
  return process.env.HOME || homedir();
}

export function configPath(): string {
  return join(getHome(), ".config", "alchemy", "config.json");
}

export function load(): Config {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    const data = readFileSync(p, "utf-8");
    return JSON.parse(data) as Config;
  } catch {
    return {};
  }
}

export function save(cfg: Config): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o755 });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function get(cfg: Config, key: string): string | undefined {
  const mapped = KEY_MAP[key];
  if (!mapped) return undefined;
  return cfg[mapped];
}

export function set(
  cfg: Config,
  key: string,
  value: string,
): { ok: boolean; config: Config } {
  const mapped = KEY_MAP[key];
  if (!mapped) return { ok: false, config: cfg };
  return { ok: true, config: { ...cfg, [mapped]: value } };
}

export function validKeys(): string[] {
  return ["api-key", "network"];
}

export function toMap(cfg: Config): Record<string, string> {
  const m: Record<string, string> = {};
  if (cfg.api_key) m.api_key = cfg.api_key;
  if (cfg.network) m.network = cfg.network;
  return m;
}
