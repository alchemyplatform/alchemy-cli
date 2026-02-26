import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { maskIf } from "./ui.js";

export interface AppConfig {
  id: string;
  name: string;
  apiKey: string;
}

export interface Config {
  api_key?: string;
  access_key?: string;
  app?: AppConfig;
  network?: string;
  verbose?: boolean;
}

const KEY_MAP: Record<string, keyof Config> = {
  "api-key": "api_key",
  api_key: "api_key",
  "access-key": "access_key",
  access_key: "access_key",
  network: "network",
  verbose: "verbose",
};

function getHome(): string {
  return process.env.HOME || homedir();
}

export function configPath(): string {
  if (process.env.ALCHEMY_CONFIG) return process.env.ALCHEMY_CONFIG;
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
  if (mapped === "verbose") {
    const normalized = value.trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      return { ok: false, config: cfg };
    }
    return { ok: true, config: { ...cfg, verbose: normalized === "true" } };
  }
  return { ok: true, config: { ...cfg, [mapped]: value } };
}

export function validKeys(): string[] {
  return ["api-key", "access-key", "network", "verbose"];
}

export function toMap(cfg: Config): Record<string, string> {
  const m: Record<string, string> = {};
  if (cfg.api_key) m["api-key"] = maskIf(cfg.api_key);
  if (cfg.access_key) m["access-key"] = maskIf(cfg.access_key);
  if (cfg.app) m["app"] = `${cfg.app.name} (${cfg.app.id})`;
  if (cfg.network) m["network"] = cfg.network;
  if (cfg.verbose !== undefined) m["verbose"] = String(cfg.verbose);
  return m;
}
