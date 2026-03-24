import { Command } from "commander";
import * as config from "../lib/config.js";
import { AUTH_PORT, getLoginUrl, openBrowser, waitForCallback, exchangeCodeForToken } from "../lib/auth.js";
import { AdminClient } from "../lib/admin-client.js";
import type { App } from "../lib/admin-client.js";
import { CLIError, ErrorCode, exitWithError } from "../lib/errors.js";
import { printHuman, isJSONMode, debug } from "../lib/output.js";
import { promptSelect } from "../lib/terminal-ui.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { green, dim, bold, brand, maskIf, withSpinner } from "../lib/ui.js";

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
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
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

        // After auth, try to fetch apps and let user select one
        if (isInteractiveAllowed(program)) {
          await selectAppAfterAuth(token);
        }

        process.exit(0);
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

async function selectAppAfterAuth(authToken: string): Promise<void> {
  let apps: App[];
  try {
    const admin = new AdminClient({ type: "auth_token", token: authToken });
    const result = await withSpinner("Fetching apps…", "Apps fetched", () =>
      admin.listAllApps(),
    );
    apps = result.apps;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debug(`Failed to fetch apps: ${msg}`);
    if (!isJSONMode()) {
      console.error(`  ${dim(`Could not fetch apps: ${msg}`)}`);
    }
    return;
  }

  if (apps.length === 0) {
    console.log(`  ${dim("No apps found. Create one at dashboard.alchemy.com")}`);
    return;
  }

  let selectedApp: App;

  if (apps.length === 1) {
    selectedApp = apps[0];
    console.log(`  ${green("✓")} Auto-selected app: ${bold(selectedApp.name)}`);
  } else {
    console.log("");
    const appId = await promptSelect({
      message: "Select an app",
      options: apps.map((app) => ({
        value: app.id,
        label: app.name,
        hint: `${app.chainNetworks.length} networks`,
      })),
      cancelMessage: "Skipped app selection.",
    });

    if (!appId) return;
    selectedApp = apps.find((a) => a.id === appId)!;
  }

  // Save selected app to config
  const cfg = config.load();
  config.save({
    ...cfg,
    app: {
      id: selectedApp.id,
      name: selectedApp.name,
      apiKey: selectedApp.apiKey,
      webhookApiKey: selectedApp.webhookApiKey,
    },
  });

  console.log(
    `  ${dim("App")} ${selectedApp.name} ${dim("saved to config")}`,
  );
}
