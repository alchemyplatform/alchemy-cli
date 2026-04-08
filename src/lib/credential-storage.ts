/**
 * Secure credential storage using cross-keychain.
 *
 * Automatically selects the best backend per platform:
 *   macOS   — Keychain (native @napi-rs/keyring, fallback to `security` CLI)
 *   Linux   — Freedesktop Secret Service (native, fallback to `secret-tool`)
 *   Windows — Windows Credential Manager (native, fallback to PowerShell)
 *   All     — AES-256-GCM encrypted file as last resort
 */

import {
  getPassword,
  setPassword,
  deletePassword,
  getKeyring,
  PasswordDeleteError,
} from "cross-keychain";

const SERVICE = "alchemy-cli";
const ACCOUNT = "oauth-credentials";

export interface StoredCredentials {
  auth_token: string;
  auth_token_expires_at: string;
}

export async function getCredentials(): Promise<StoredCredentials | null> {
  try {
    const raw = await getPassword(SERVICE, ACCOUNT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.auth_token === "string" &&
      typeof parsed.auth_token_expires_at === "string"
    ) {
      return parsed as StoredCredentials;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCredentials(creds: StoredCredentials): Promise<void> {
  await setPassword(SERVICE, ACCOUNT, JSON.stringify(creds));
}

export async function deleteCredentials(): Promise<void> {
  try {
    await deletePassword(SERVICE, ACCOUNT);
  } catch (err) {
    // Ignore "not found" errors — credential may not exist
    if (!(err instanceof PasswordDeleteError)) {
      throw err;
    }
  }
}

/**
 * Returns which backend is currently active.
 * Useful for `alchemy auth status` output.
 */
export async function getStorageBackend(): Promise<string> {
  try {
    const keyring = await getKeyring();
    return keyring.name;
  } catch {
    return "unknown";
  }
}
