/**
 * Secure credential storage with macOS Keychain support.
 *
 * Two-tier storage following Claude Code's pattern:
 *   Tier 1 — macOS Keychain via the `security` CLI (no native deps)
 *   Tier 2 — Permission-restricted file (~/.config/alchemy/.credentials.json, 0o600)
 *
 * Keychain is preferred when available; file is the automatic fallback.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join, dirname } from "node:path";

const KEYCHAIN_SERVICE = "Alchemy CLI";
const KEYCHAIN_ACCOUNT = process.env.USER || userInfo().username;

export interface StoredCredentials {
  auth_token: string;
  auth_token_expires_at: string;
}

// ---------------------------------------------------------------------------
// macOS Keychain backend (via `security` CLI)
// ---------------------------------------------------------------------------

let keychainAvailableCache: boolean | undefined;

function isKeychainAvailable(): boolean {
  if (keychainAvailableCache !== undefined) return keychainAvailableCache;
  if (process.platform !== "darwin") {
    keychainAvailableCache = false;
    return false;
  }
  try {
    // Exit code 0 or 36 (locked but accessible) both mean keychain exists
    execFileSync("security", ["show-keychain-info"], {
      stdio: "pipe",
      timeout: 5_000,
    });
    keychainAvailableCache = true;
    return true;
  } catch (err: unknown) {
    // exit code 36 = keychain locked but present — still usable
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 36) {
      keychainAvailableCache = true;
      return true;
    }
    keychainAvailableCache = false;
    return false;
  }
}

function keychainGet(): StoredCredentials | null {
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-w", "-s", KEYCHAIN_SERVICE],
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5_000 },
    ).trim();

    // -X stores hex-decoded bytes; -w returns them as a string (already decoded)
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.auth_token === "string" && typeof parsed.auth_token_expires_at === "string") {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

function keychainSet(creds: StoredCredentials): boolean {
  try {
    const hex = Buffer.from(JSON.stringify(creds), "utf-8").toString("hex");
    // -U updates if the entry already exists
    execFileSync(
      "security",
      ["add-generic-password", "-U", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-X", hex],
      { stdio: "pipe", timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

function keychainDelete(): boolean {
  try {
    execFileSync(
      "security",
      ["delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE],
      { stdio: "pipe", timeout: 5_000 },
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// File backend (fallback)
// ---------------------------------------------------------------------------

function credentialsFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
  return join(configHome, "alchemy", ".credentials.json");
}

function fileGet(): StoredCredentials | null {
  const p = credentialsFilePath();
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    if (data && typeof data.auth_token === "string" && typeof data.auth_token_expires_at === "string") {
      return data as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

function fileSet(creds: StoredCredentials): void {
  const p = credentialsFilePath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o755 });
  writeFileSync(p, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
}

function fileDelete(): void {
  const p = credentialsFilePath();
  try {
    unlinkSync(p);
  } catch {
    // File may not exist — that's fine
  }
}

// ---------------------------------------------------------------------------
// Public API — auto-selects backend
// ---------------------------------------------------------------------------

export function getCredentials(): StoredCredentials | null {
  if (isKeychainAvailable()) {
    const creds = keychainGet();
    if (creds) return creds;
  }
  // Fallback to file (also used if keychain entry doesn't exist yet)
  return fileGet();
}

export function saveCredentials(creds: StoredCredentials): void {
  if (isKeychainAvailable()) {
    if (keychainSet(creds)) {
      // If we successfully saved to keychain, clean up any file-based credentials
      fileDelete();
      return;
    }
  }
  // Fallback to file
  fileSet(creds);
}

export function deleteCredentials(): void {
  if (isKeychainAvailable()) {
    keychainDelete();
  }
  fileDelete();
}

/**
 * Returns which backend is currently active.
 * Useful for `alchemy auth status` output.
 */
export function getStorageBackend(): "keychain" | "file" {
  return isKeychainAvailable() ? "keychain" : "file";
}

export { credentialsFilePath };
