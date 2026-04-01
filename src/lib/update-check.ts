import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { configPath } from "./config.js";
import { esc } from "./colors.js";

declare const __CLI_VERSION__: string;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const UPDATE_INSTALL_COMMAND = "npm i -g @alchemy/cli@latest";

interface UpdateCache {
  latest: string;
  checkedAt: number;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  installCommand: string;
  checkedAt: number | null;
}

function cachePath(): string {
  return configPath().replace(/config\.json$/, ".update-check");
}

function readCache(): UpdateCache | null {
  try {
    return JSON.parse(readFileSync(cachePath(), "utf-8"));
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    const p = cachePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(cache), { mode: 0o600 });
  } catch {
    // Best-effort; don't disrupt the CLI.
  }
}

function fetchLatestVersion(): string | null {
  try {
    const result = execFileSync("npm", ["view", "@alchemy/cli", "version"], {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns true if `a` is strictly less than `b`.
 * Handles major.minor.patch only (no pre-release tags).
 */
function semverLT(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
}

function currentVersion(): string {
  return typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0";
}

function toUpdateStatus(latestVersion: string | null, checkedAt: number | null): UpdateStatus {
  const current = currentVersion();
  return {
    currentVersion: current,
    latestVersion,
    updateAvailable: latestVersion ? semverLT(current, latestVersion) : false,
    installCommand: UPDATE_INSTALL_COMMAND,
    checkedAt,
  };
}

/**
 * Resolve update status for display or machine-readable checks.
 * Falls back to the most recent cached version when a refresh fails.
 */
export function getUpdateStatus(): UpdateStatus {
  const cache = readCache();
  if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
    return toUpdateStatus(cache.latest, cache.checkedAt);
  }

  const latest = fetchLatestVersion();
  if (latest) {
    const checkedAt = Date.now();
    writeCache({ latest, checkedAt });
    return toUpdateStatus(latest, checkedAt);
  }

  if (cache) {
    return toUpdateStatus(cache.latest, cache.checkedAt);
  }

  return toUpdateStatus(null, null);
}

/**
 * Check for a newer version of the CLI on npm. Uses a 24-hour cache so
 * network calls happen at most once per day. Returns the latest version
 * string if an update is available, or `null` otherwise.
 */
export function getAvailableUpdate(): string | null {
  const current = currentVersion();

  const cache = readCache();
  if (cache && Date.now() - cache.checkedAt < CACHE_TTL_MS) {
    return semverLT(current, cache.latest) ? cache.latest : null;
  }

  const latest = fetchLatestVersion();
  if (latest) {
    writeCache({ latest, checkedAt: Date.now() });
    return semverLT(current, latest) ? latest : null;
  }

  return null;
}

/**
 * Format the update notification so it can be rendered in multiple flows.
 */
export function getUpdateNoticeLines(latest: string): string[] {
  const yellow = esc("33");
  const bold = esc("1");
  const dim = esc("2");

  return [
    `  ${yellow("Update available")} ${dim(currentVersion())} → ${bold(latest)}`,
    `  Run ${bold(UPDATE_INSTALL_COMMAND)} to update`,
  ];
}

/**
 * Print an update notification to stderr. Call this after command output
 * so it doesn't interfere with JSON piping.
 */
export function printUpdateNotice(latest: string): void {
  process.stderr.write(`\n${getUpdateNoticeLines(latest).join("\n")}\n\n`);
}
