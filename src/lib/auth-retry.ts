import { load, save, type Config } from "./config.js";
import { AUTH_PORT, getLoginUrl, openBrowser, waitForCallback, exchangeCodeForToken } from "./auth.js";
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
    // Check if it's a 401
    if (!is401(err)) throw err;

    // Don't retry in non-interactive mode
    if (!checkInteractive(program)) throw err;

    if (!isJSONMode()) {
      console.log(`\n  ${dim("Session expired. Re-authenticating...")}`);
    }

    // Clear expired token
    const updatedCfg = load();
    save({ ...updatedCfg, auth_token: undefined, auth_token_expires_at: undefined });

    // Re-authenticate
    const port = AUTH_PORT;
    const loginUrl = getLoginUrl(port);
    const callbackPromise = waitForCallback(port);
    openBrowser(loginUrl);

    const callback = await callbackPromise;
    const token = await exchangeCodeForToken(callback.code, port);
    callback.sendSuccess();

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const freshCfg = load();
    save({ ...freshCfg, auth_token: token, auth_token_expires_at: expiresAt });

    // Retry with new token
    return fn(token);
  }
}

function is401(err: unknown): boolean {
  if (err && typeof err === "object") {
    if ("status" in err && (err as { status: number }).status === 401) return true;
    if ("message" in err && typeof (err as { message: string }).message === "string") {
      return (err as { message: string }).message.includes("401");
    }
  }
  return false;
}
