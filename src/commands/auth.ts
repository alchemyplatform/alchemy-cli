import { Command } from "commander";
import * as config from "../lib/config.js";
import { AUTH_PORT, prepareBrowserLogin, performBrowserLogin, revokeToken, waitForCallback, openBrowser, exchangeCodeForToken, parseHeadlessCallback } from "../lib/auth.js";
import type { PreparedLogin, HeadlessCallback, TokenExchangeResult } from "../lib/auth.js";
import { AdminClient } from "../lib/admin-client.js";
import type { App } from "../lib/admin-client.js";
import { CLIError, ErrorCode, exitWithError } from "../lib/errors.js";
import { printHuman, isJSONMode, debug } from "../lib/output.js";
import { promptAutocomplete, promptText } from "../lib/terminal-ui.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { readStdinArg } from "../lib/validators.js";
import { resolveAuthToken } from "../lib/resolve.js";
import { green, dim, bold, brand, maskIf, withSpinner } from "../lib/ui.js";
import { saveCredentials, deleteCredentials, getCredentials, getStorageBackend } from "../lib/credential-storage.js";

export function registerAuth(program: Command) {
  const cmd = program
    .command("auth")
    .description("Authenticate with your Alchemy account")
    .option("-y, --yes", "Skip confirmation prompt and open browser immediately");

  cmd
    .command("login", { isDefault: true })
    .description("Log in via browser")
    .option("--force", "Force re-authentication even if a valid token exists")
    .option("-y, --yes", "Skip confirmation prompt and open browser immediately")
    .option(
      "--headless",
      "Print the login URL and paste back the redirect (for remote/SSH machines with no reachable browser)",
    )
    .option("--no-browser", "Alias for --headless")
    .action(async (opts: { force?: boolean; yes?: boolean; headless?: boolean; browser?: boolean }) => {
      const yes = opts.yes || cmd.opts().yes;
      // `--no-browser` sets `browser` to false (Commander negatable option).
      const headless = Boolean(opts.headless) || opts.browser === false;
      try {
        // Skip browser flow if we already have a valid token
        if (!opts.force) {
          const existing = await resolveAuthToken();
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
          const existingCreds = await getCredentials();
          const tokenToRevoke = existingCreds?.auth_token;
          // Also check legacy config for tokens not yet migrated
          if (!tokenToRevoke) {
            const cfg = config.load();
            if (cfg.auth_token) {
              await revokeToken(cfg.auth_token);
              config.save({ ...cfg, auth_token: undefined, auth_token_expires_at: undefined });
            }
          } else {
            await revokeToken(tokenToRevoke);
          }
          await deleteCredentials();
        }

        // Prepare PKCE values + authorize URL once, then either run the local
        // browser/callback flow or the headless paste-back flow.
        const prepared = prepareBrowserLogin();

        if (headless) {
          await runHeadlessLogin(program, prepared);
          return;
        }

        // Start callback server immediately so the URL is usable even if the
        // user pastes it before pressing Enter.
        const callbackPromise = waitForCallback(AUTH_PORT);

        if (!isJSONMode()) {
          console.log("");
          console.log(`  ${brand("◆")} ${bold("Alchemy Authentication")}`);
          console.log(`  ${dim("────────────────────────────────────")}`);
          console.log("");
          console.log(`  ${dim(prepared.authorizeUrl)}`);
          console.log("");
        }

        // Race the prompt against the callback — if the user pastes the URL
        // and completes auth in the browser, we don't need them to press Enter.
        let browserOpened = false;
        if (!yes && !isJSONMode() && isInteractiveAllowed(program)) {
          const promptResult = await Promise.race([
            promptText({
              message: "Press Enter to open browser, or paste the URL above to log in manually",
              cancelMessage: "Login cancelled.",
            }),
            callbackPromise.then(() => "callback_received" as const),
          ]);
          if (promptResult === null) return; // user cancelled
          if (promptResult !== "callback_received") {
            // User pressed Enter — open browser
            if (!isJSONMode()) {
              console.log(`  Opening browser to log in...`);
              console.log(`  ${dim("Waiting for authentication...")}`);
            }
            openBrowser(prepared.authorizeUrl);
            browserOpened = true;
          }
        }

        if (!browserOpened && yes) {
          if (!isJSONMode()) {
            console.log(`  Opening browser to log in...`);
            console.log(`  ${dim("Waiting for authentication...")}`);
          }
          openBrowser(prepared.authorizeUrl);
        }

        const callback = await callbackPromise;

        // The callback server always echoes state, so validate it strictly.
        const result = await completeLogin(
          prepared,
          { code: callback.code, state: callback.state },
          {
            requireState: true,
            onSuccess: () => callback.sendSuccess(),
            onError: (message) => callback.sendError(message),
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
    .action(async () => {
      try {
        const creds = await getCredentials();
        const cfg = config.load();
        const validToken = await resolveAuthToken(cfg);

        // Check if there's any token at all (credential storage or legacy config)
        const hasToken = creds?.auth_token || cfg.auth_token;
        if (!hasToken) {
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

        const expiresAt = creds?.auth_token_expires_at || cfg.auth_token_expires_at || "unknown";
        const backend = await getStorageBackend();
        const storedIn = creds?.auth_token
          ? backend
          : "config file (legacy)";

        printHuman(
          `  ${green("✓")} Authenticated\n` +
            `  ${dim("Token:")} ${maskIf(validToken)}\n` +
            `  ${dim("Storage:")} ${storedIn}\n` +
            `  ${dim("Expires:")} ${expiresAt}\n`,
          {
            authenticated: true,
            expired: false,
            expiresAt,
            storageBackend: storedIn,
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
        // Find the active token from credential storage or legacy config
        const creds = await getCredentials();
        const cfg = config.load();
        const activeToken = creds?.auth_token || cfg.auth_token;

        let revokeResult: Awaited<ReturnType<typeof revokeToken>> | undefined;
        if (activeToken) {
          revokeResult = await revokeToken(activeToken);
        }

        // Clear from secure credential storage
        await deleteCredentials();

        // Clear auth-related fields from config (token, expiry, and app selected during login)
        const { auth_token: _, auth_token_expires_at: __, app: ___, ...rest } = cfg as Record<string, unknown>;
        config.save(rest as config.Config);

        if (!activeToken) {
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

/**
 * Shared post-authorization path used by both the local-browser callback flow
 * and the `--headless` paste-back flow: validate state, exchange the code for a
 * token via PKCE, persist credentials, clean up legacy config, and print the
 * success summary.
 *
 * `requireState` is true for the callback server (which always returns state)
 * and false for headless input (a raw-code paste has no state — PKCE still
 * protects the exchange, so we only validate state when it is present).
 */
async function completeLogin(
  prepared: PreparedLogin,
  received: HeadlessCallback,
  opts: {
    requireState: boolean;
    onSuccess?: () => void;
    onError?: (message: string) => void;
  },
): Promise<TokenExchangeResult> {
  // Validate state to prevent CSRF (only when we have one, unless required).
  if (
    (opts.requireState || received.state !== null) &&
    received.state !== prepared.state
  ) {
    opts.onError?.("State mismatch — possible CSRF attack.");
    throw new Error("OAuth state mismatch. Authentication aborted.");
  }

  let result: TokenExchangeResult;
  try {
    result = await exchangeCodeForToken(received.code, AUTH_PORT, {
      codeVerifier: prepared.codeVerifier,
    });
    opts.onSuccess?.();
  } catch (err) {
    opts.onError?.("Failed to complete authentication. Please try again.");
    throw err;
  }

  // Save token to secure credential storage (Keychain on macOS, file fallback)
  await saveCredentials({
    auth_token: result.token,
    auth_token_expires_at: result.expiresAt,
  });

  // Clean up any legacy token from config.json
  const cfg = config.load();
  if (cfg.auth_token) {
    config.save({ ...cfg, auth_token: undefined, auth_token_expires_at: undefined });
  }

  const backend = await getStorageBackend();
  printHuman(
    `  ${green("✓")} Logged in successfully\n` +
      `  ${dim("Credentials stored in")} ${backend}\n` +
      `  ${dim("Expires:")} ${result.expiresAt}\n`,
    {
      status: "authenticated",
      expiresAt: result.expiresAt,
      storageBackend: backend,
    },
  );

  return result;
}

/**
 * Headless login: no browser is opened and no local callback server is started.
 * We print the authorize URL, the user authorizes in any browser, then pastes
 * the (unreachable) localhost redirect URL — or just the code — back to us.
 */
async function runHeadlessLogin(
  program: Command,
  prepared: PreparedLogin,
): Promise<void> {
  const stdinPiped = !process.stdin.isTTY;

  if (isJSONMode()) {
    // JSON mode must emit valid JSON only, so we cannot interactively prompt.
    // Require the code/redirect on stdin (single round-trip keeps PKCE valid).
    if (!stdinPiped) {
      throw new CLIError(
        ErrorCode.AUTH_REQUIRED,
        `Headless login in --json mode needs the authorization code on stdin. ` +
          `Open ${prepared.authorizeUrl} in a browser, authorize, then run: ` +
          `echo "<code-or-redirect-url>" | alchemy auth login --headless --json`,
      );
    }
  } else {
    console.log("");
    console.log(`  ${brand("◆")} ${bold("Alchemy Authentication (headless)")}`);
    console.log(`  ${dim("────────────────────────────────────")}`);
    console.log("");
    console.log(`  ${dim("Open this URL in any browser and authorize:")}`);
    console.log("");
    console.log(`  ${prepared.authorizeUrl}`);
    console.log("");
    console.log(
      `  ${dim(`The browser will land on http://localhost:${AUTH_PORT}/callback?… which won't load — that's expected.`)}`,
    );
    console.log(
      `  ${dim("Copy the full URL from the address bar (or just the code value) and paste it below.")}`,
    );
  }

  // Read the pasted URL/code: piped stdin first, otherwise an interactive prompt.
  let input: string | null;
  if (stdinPiped) {
    input = await readStdinArg("authorization code");
  } else {
    input = await promptText({
      message: "Paste the redirected URL (or just the code)",
      cancelMessage: "Login cancelled.",
    });
  }
  if (input === null) return; // user cancelled the prompt

  const received = parseHeadlessCallback(input);
  const result = await completeLogin(prepared, received, { requireState: false });

  if (isInteractiveAllowed(program)) {
    await selectAppAfterAuth(result.token);
  }

  process.exit(0);
}

export async function selectAppAfterAuth(authToken: string): Promise<void> {
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
    const appId = await promptAutocomplete({
      message: "Select an app",
      placeholder: "Type to search by name",
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
