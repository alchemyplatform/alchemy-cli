import { load, save } from "./config.js";
import { performBrowserLogin } from "./auth.js";
import { CLIError, ErrorCode } from "./errors.js";
import { isInteractiveAllowed as checkInteractive } from "./interaction.js";
import { dim } from "./ui.js";
import { isJSONMode } from "./output.js";
import type { Command } from "commander";

export async function withAuthRetry<T>(
  program: Command,
  fn: (authToken: string) => Promise<T>,
): Promise<T> {
  const cfg = load();
  if (!cfg.auth_token) {
    throw new Error("Not authenticated. Run 'alchemy auth' to log in.");
  }

  try {
    return await fn(cfg.auth_token);
  } catch (err: unknown) {
    if (!is401(err)) throw err;
    if (!checkInteractive(program)) throw err;

    if (!isJSONMode()) {
      console.log(`\n  ${dim("Session expired. Re-authenticating...")}`);
    }

    // Clear expired token and re-authenticate
    save({ ...cfg, auth_token: undefined, auth_token_expires_at: undefined });
    const result = await performBrowserLogin();
    const freshCfg = load();
    save({
      ...freshCfg,
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
