import { load, save } from "./config.js";
import { performBrowserLogin } from "./auth.js";
import { CLIError, ErrorCode } from "./errors.js";
import { isInteractiveAllowed as checkInteractive } from "./interaction.js";
import { resolveAuthToken } from "./resolve.js";
import { dim } from "./ui.js";
import { isJSONMode } from "./output.js";
import { deleteCredentials, saveCredentials } from "./credential-storage.js";
import type { Command } from "commander";

export async function withAuthRetry<T>(
  program: Command,
  fn: (authToken: string) => Promise<T>,
): Promise<T> {
  const cfg = load();
  const token = resolveAuthToken(cfg);
  if (!token) {
    throw new Error("Not authenticated or session expired. Run 'alchemy auth' to log in.");
  }

  try {
    return await fn(token);
  } catch (err: unknown) {
    if (!is401(err)) throw err;
    if (!checkInteractive(program)) throw err;

    if (!isJSONMode()) {
      console.log(`\n  ${dim("Session expired. Re-authenticating...")}`);
    }

    // Clear expired credentials and re-authenticate
    deleteCredentials();
    // Also clear legacy config token
    if (cfg.auth_token) {
      save({ ...cfg, auth_token: undefined, auth_token_expires_at: undefined });
    }

    const result = await performBrowserLogin();
    saveCredentials({
      auth_token: result.token,
      auth_token_expires_at: result.expiresAt,
    });

    return fn(result.token);
  }
}

function is401(err: unknown): boolean {
  if (err instanceof CLIError) {
    return (
      err.code === ErrorCode.AUTH_REQUIRED ||
      err.code === ErrorCode.INVALID_ACCESS_KEY
    );
  }
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status: number }).status === 401;
  }
  return false;
}
