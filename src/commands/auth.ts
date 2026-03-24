import { Command } from "commander";
import * as config from "../lib/config.js";
import { AUTH_PORT, getLoginUrl, openBrowser, waitForCallback, exchangeCodeForToken } from "../lib/auth.js";
import { CLIError, ErrorCode, exitWithError } from "../lib/errors.js";
import { printHuman, isJSONMode } from "../lib/output.js";
import { green, dim, bold, brand, maskIf } from "../lib/ui.js";

export function registerAuth(program: Command) {
  const cmd = program
    .command("auth")
    .description("Authenticate with your Alchemy account");

  cmd
    .command("login", { isDefault: true })
    .description("Log in via browser")
    .action(async () => {
      try {
        const port = AUTH_PORT;
        const loginUrl = getLoginUrl(port);

        if (!isJSONMode()) {
          console.log("");
          console.log(`  ${brand("◆")} ${bold("Alchemy Authentication")}`);
          console.log(`  ${dim("────────────────────────────────────")}`);
          console.log("");
          console.log(`  Opening browser to log in...`);
          console.log(`  ${dim(loginUrl)}`);
          console.log("");
        }

        // Start callback server before opening browser
        const callbackPromise = waitForCallback(port);
        openBrowser(loginUrl);

        if (!isJSONMode()) {
          console.log(`  ${dim("Waiting for authentication...")}`);
        }

        const callback = await callbackPromise;

        // Exchange code for token (backchannel)
        let token: string;
        try {
          token = await exchangeCodeForToken(callback.code, port);
          callback.sendSuccess();
        } catch (err) {
          callback.sendError("Failed to complete authentication. Please try again.");
          throw err;
        }

        // Save token to config
        const cfg = config.load();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        config.save({
          ...cfg,
          auth_token: token,
          auth_token_expires_at: expiresAt,
        });

        printHuman(
          `  ${green("✓")} Logged in successfully\n` +
            `  ${dim("Token saved to")} ${config.configPath()}\n` +
            `  ${dim("Expires:")} ${expiresAt}\n`,
          {
            status: "authenticated",
            expiresAt,
            configPath: config.configPath(),
          },
        );
      } catch (err) {
        exitWithError(
          err instanceof CLIError
            ? err
            : new CLIError(ErrorCode.AUTH_REQUIRED, String((err as Error).message)),
        );
      }
    });

  cmd
    .command("status")
    .description("Show current authentication status")
    .action(() => {
      try {
        const cfg = config.load();
        if (!cfg.auth_token) {
          printHuman(
            `  ${dim("Not authenticated. Run")} alchemy auth ${dim("to log in.")}\n`,
            { authenticated: false },
          );
          return;
        }

        const expired = cfg.auth_token_expires_at
          ? new Date(cfg.auth_token_expires_at) < new Date()
          : false;

        if (expired) {
          printHuman(
            `  ${dim("Session expired. Run")} alchemy auth ${dim("to log in again.")}\n`,
            { authenticated: false, expired: true },
          );
          return;
        }

        printHuman(
          `  ${green("✓")} Authenticated\n` +
            `  ${dim("Token:")} ${maskIf(cfg.auth_token)}\n` +
            `  ${dim("Expires:")} ${cfg.auth_token_expires_at || "unknown"}\n`,
          {
            authenticated: true,
            expired: false,
            expiresAt: cfg.auth_token_expires_at,
          },
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("logout")
    .description("Clear saved authentication token")
    .action(() => {
      try {
        const cfg = config.load();
        const { auth_token: _, auth_token_expires_at: __, ...rest } = cfg as Record<string, unknown>;
        config.save(rest as config.Config);
        printHuman(
          `  ${green("✓")} Logged out\n`,
          { status: "logged_out" },
        );
      } catch (err) {
        exitWithError(err);
      }
    });
}
