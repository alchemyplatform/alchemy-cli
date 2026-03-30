import { Command } from "commander";
import * as config from "../lib/config.js";
import { AUTH_PORT, getLoginUrl, performBrowserLogin, revokeToken } from "../lib/auth.js";
import { AdminClient } from "../lib/admin-client.js";
import type { App } from "../lib/admin-client.js";
import { CLIError, ErrorCode, exitWithError } from "../lib/errors.js";
import { printHuman, isJSONMode, debug } from "../lib/output.js";
import { promptSelect } from "../lib/terminal-ui.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { resolveAuthToken } from "../lib/resolve.js";
import { green, dim, bold, brand, maskIf, withSpinner } from "../lib/ui.js";

export function registerAuth(program: Command) {
  const cmd = program
    .command("auth")
    .description("Authenticate with your Alchemy account");

  cmd
    .command("login", { isDefault: true })
    .description("Log in via browser")
    .option("--force", "Force re-authentication even if a valid token exists")
    .action(async (opts: { force?: boolean }) => {
      try {
        // Skip browser flow if we already have a valid token
        if (!opts.force) {
          const existing = resolveAuthToken();
          if (existing) {
            printHuman(
              `  ${green("✓")} Already authenticated\n` +
                `  ${dim("Token:")} ${maskIf(existing)}\n` +
                `  ${dim("Run")} alchemy auth login --force ${dim("to re-authenticate.")}\n`,
              { status: "already_authenticated" },
            );
            return;
          }
        }

        // If --force, revoke the existing token server-side before re-authenticating
        if (opts.force) {
          const cfg = config.load();
          if (cfg.auth_token) {
            await revokeToken(cfg.auth_token);
            config.save({ ...cfg, auth_token: undefined, auth_token_expires_at: undefined });
          }
        }

        if (!isJSONMode()) {
          console.log("");
          console.log(`  ${brand("◆")} ${bold("Alchemy Authentication")}`);
          console.log(`  ${dim("────────────────────────────────────")}`);
          console.log("");
          console.log(`  Opening browser to log in...`);
          console.log(`  ${dim(getLoginUrl(AUTH_PORT))}`);
          console.log("");
          console.log(`  ${dim("Waiting for authentication...")}`);
        }

        const result = await performBrowserLogin();

        // Save token to config
        const cfg = config.load();
        config.save({
          ...cfg,
          auth_token: result.token,
          auth_token_expires_at: result.expiresAt,
        });
        const expiresAt = result.expiresAt;

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
          await selectAppAfterAuth(result.token);
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
        const validToken = resolveAuthToken(cfg);

        if (!cfg.auth_token) {
          printHuman(
            `  ${dim("Not authenticated. Run")} alchemy auth ${dim("to log in.")}\n`,
            { authenticated: false },
          );
          return;
        }

        if (!validToken) {
          printHuman(
            `  ${dim("Session expired. Run")} alchemy auth ${dim("to log in again.")}\n`,
            { authenticated: false, expired: true },
          );
          return;
        }

        printHuman(
          `  ${green("✓")} Authenticated\n` +
            `  ${dim("Token:")} ${maskIf(validToken)}\n` +
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
    .action(async () => {
      try {
        const cfg = config.load();
        let revokeResult: Awaited<ReturnType<typeof revokeToken>> | undefined;
        if (cfg.auth_token) {
          revokeResult = await revokeToken(cfg.auth_token);
        }
        const { auth_token: _, auth_token_expires_at: __, ...rest } = cfg as Record<string, unknown>;
        config.save(rest as config.Config);

        if (!cfg.auth_token) {
          printHuman(
            `  ${dim("No active session.")}\n`,
            { status: "no_session" },
          );
        } else if (revokeResult === "already_invalid") {
          printHuman(
            `  ${green("✓")} Logged out ${dim("(token was already invalidated)")}\n`,
            { status: "logged_out", tokenAlreadyInvalid: true },
          );
        } else if (revokeResult === "server_error" || revokeResult === "network_error") {
          printHuman(
            `  ${green("✓")} Logged out locally ${dim("(could not reach server to revoke token)")}\n`,
            { status: "logged_out", serverRevoked: false },
          );
        } else {
          printHuman(
            `  ${green("✓")} Logged out\n`,
            { status: "logged_out" },
          );
        }
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
    const found = apps.find((a) => a.id === appId);
    if (!found) return;
    selectedApp = found;
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
