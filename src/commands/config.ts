import { Command } from "commander";
import * as config from "../lib/config.js";
import { getSetupStatus } from "../lib/onboarding.js";
import { AdminClient } from "../lib/admin-client.js";
import type { App } from "../lib/admin-client.js";
import { adminClientFromFlags } from "../lib/resolve.js";
import { errNotFound, errInvalidArgs, exitWithError } from "../lib/errors.js";
import { printHuman, printJSON, isJSONMode } from "../lib/output.js";
import { green, dim, yellow, withSpinner, printKeyValue, maskIf } from "../lib/ui.js";
import {
  promptAutocomplete,
  promptConfirm,
  promptMultiselect,
  promptSelect,
  promptText,
} from "../lib/terminal-ui.js";
import { splitCommaList } from "../lib/validators.js";
import { isInteractiveAllowed } from "../lib/interaction.js";

const RESET_KEY_MAP: Record<string, keyof config.Config> = { ...config.KEY_MAP, app: "app" };
const APP_SEARCH_THRESHOLD = 15;

export async function saveAppWithPrompt(app: App): Promise<boolean> {
  const cfg = config.load();
  const updated: config.Config = {
    ...cfg,
    api_key: app.apiKey,
    app: { id: app.id, name: app.name, apiKey: app.apiKey, webhookApiKey: app.webhookApiKey },
  };

  // If user has a manually-set api-key, ask whether to replace it
  if (cfg.api_key) {
    const replace = await promptConfirm({
      message:
        "You already have an API key configured. Use the app's API key instead?",
      initialValue: true,
      cancelMessage: "Cancelled default app update.",
    });
    if (replace === null) {
      return false;
    }
    if (!replace) {
      updated.api_key = cfg.api_key;
    }
  }

  config.save(updated);
  return true;
}

export async function selectOrCreateApp(admin: AdminClient): Promise<void> {
  let apps: App[];
  try {
    const result = await withSpinner("Fetching apps…", "Apps fetched", () =>
      admin.listAllApps(),
    );
    apps = result.apps;
  } catch {
    console.log(
      `  ${dim("Could not fetch apps. Skipping app selection.")}`,
    );
    return;
  }

  if (apps.length > 0) {
    const CREATE_NEW = "__create_new__";
    const options = [
      ...apps.map((a) => ({
        label: `${a.name} (${a.id})`,
        value: a.id,
      })),
      { label: "Create a new app", value: CREATE_NEW },
    ];
    const selected =
      apps.length > APP_SEARCH_THRESHOLD
        ? await promptAutocomplete({
            message: "Select default app",
            placeholder: "Type app name or id",
            options,
            cancelMessage: "Cancelled app selection.",
            commitLabel: null,
          })
        : await promptSelect({
            message: "Select default app",
            options,
            cancelMessage: "Cancelled app selection.",
            commitLabel: null,
          });
    if (selected === null) {
      return;
    }

    if (selected !== CREATE_NEW) {
      const app = apps.find((a) => a.id === selected)!;
      const saved = await saveAppWithPrompt(app);
      if (saved) {
        console.log(`\n  ${green("✓")} Default app set to ${app.name} (${app.id})`);
      } else {
        console.log(`  ${dim("Skipped setting default app.")}`);
      }
      return;
    }
  } else {
    console.log(`  ${dim("No apps found. Let's create one.")}`);
  }

  // Create flow
  const name = await promptText({
    message: "App name",
    cancelMessage: "Cancelled app creation.",
  });
  if (name === null) {
    return;
  }
  if (!name.trim()) {
    console.log(`  ${dim("Skipped app creation.")}`);
    return;
  }

  // Fetch chains for network selection
  let chainChoices: Array<{ label: string; value: string }> = [];
  try {
    const chains = await withSpinner("Fetching chains…", "Chains fetched", () =>
      admin.listChains(),
    );
    chainChoices = chains
      .filter((c) => c.availability === "public" && !c.isTestnet)
      .map((c) => ({ label: `${c.name} (${c.id})`, value: c.id }));
  } catch {
    // Fallback to manual input if chains API fails
  }

  let networks: string[];
  if (chainChoices.length > 0) {
    const selectedNetworks = await promptMultiselect({
      message: "Select networks",
      options: chainChoices,
      required: true,
      cancelMessage: "Cancelled network selection.",
    });
    if (selectedNetworks === null) {
      return;
    }
    networks = selectedNetworks;
  } else {
    const raw = await promptText({
      message: "Network IDs (comma-separated)",
      cancelMessage: "Cancelled network selection.",
    });
    if (raw === null) {
      return;
    }
    networks = splitCommaList(raw);
  }

  if (networks.length === 0) {
    console.log(`  ${dim("No networks selected. Skipped app creation.")}`);
    return;
  }

  try {
    const app = await withSpinner("Creating app…", "App created", () =>
      admin.createApp({ name: name.trim(), networks }),
    );
    console.log(`  ${green("✓")} Created app ${app.name} (${app.id})`);

    const setDefault = await promptConfirm({
      message: "Set as default app?",
      initialValue: true,
      cancelMessage: "Cancelled default app selection.",
    });
    if (setDefault === null) {
      return;
    }

    if (setDefault) {
      const saved = await saveAppWithPrompt(app);
      if (saved) {
        console.log(`\n  ${green("✓")} Default app set to ${app.name} (${app.id})`);
      } else {
        console.log(`  ${dim("Skipped setting default app.")}`);
      }
    }
  } catch (err) {
    exitWithError(err);
  }
}

export function registerConfig(program: Command) {
  const cmd = program.command("config").description("Manage CLI configuration");

  // ── config set ─────────────────────────────────────────────────────

  const setCmd = cmd.command("set").description("Set a config value");

  setCmd
    .command("api-key <key>")
    .description("Set the Alchemy API key for RPC operations")
    .action((key: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, api_key: key });
        printHuman(`${green("✓")} Set api-key\n`, { key: "api-key", status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("webhook-api-key <key>")
    .description("Set the Alchemy webhook API key for Notify operations")
    .action((key: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, webhook_api_key: key });
        printHuman(`${green("✓")} Set webhook-api-key\n`, { key: "webhook-api-key", status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("app [app-id]")
    .description("Select the default app (interactive) or set by ID")
    .action(async (appId?: string) => {
      try {
        const admin = adminClientFromFlags(program);

        if (appId) {
          // Non-interactive: look up the app by ID and save it
          const app = await withSpinner("Fetching app…", "App fetched", () =>
            admin.getApp(appId),
          );
          const cfg = config.load();
          const updated: config.Config = {
            ...cfg,
            api_key: app.apiKey,
            app: { id: app.id, name: app.name, apiKey: app.apiKey, webhookApiKey: app.webhookApiKey },
          };
          config.save(updated);
          printHuman(
            `${green("✓")} Default app set to ${app.name} (${app.id})\n`,
            { app: { id: app.id, name: app.name }, status: "set" },
          );
          return;
        }

        // Interactive mode
        if (!isInteractiveAllowed(program)) {
          exitWithError(
            new Error("Interactive app selection requires an interactive terminal. Use 'config set app <app-id>' or 'alchemy app list' to find app IDs."),
          );
        }

        await selectOrCreateApp(admin);
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("network <network>")
    .description("Set the default network (e.g. eth-mainnet, polygon-mainnet)")
    .action((network: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, network });
        printHuman(`${green("✓")} Set network to ${network}\n`, { key: "network", value: network, status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("verbose <enabled>")
    .description("Set default verbose output (true|false)")
    .action((enabled: string) => {
      try {
        const normalized = enabled.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          throw errInvalidArgs("verbose must be 'true' or 'false'");
        }
        const verbose = normalized === "true";
        const cfg = config.load();
        config.save({ ...cfg, verbose });
        printHuman(
          `${green("✓")} Set verbose default to ${verbose}\n`,
          { key: "verbose", value: String(verbose), status: "set" },
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("wallet-key-file <path>")
    .description("Set the path to a wallet private key file for x402")
    .action((path: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, wallet_key_file: path });
        printHuman(`${green("✓")} Set wallet-key-file\n`, { key: "wallet-key-file", status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("x402 <enabled>")
    .description("Enable or disable x402 wallet-based auth by default (true|false)")
    .action((enabled: string) => {
      try {
        const normalized = enabled.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          throw errInvalidArgs("x402 must be 'true' or 'false'");
        }
        const x402 = normalized === "true";
        const cfg = config.load();
        config.save({ ...cfg, x402 });
        printHuman(
          `${green("✓")} Set x402 default to ${x402}\n`,
          { key: "x402", value: String(x402), status: "set" },
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("evm-gas-sponsored <enabled>")
    .description("Enable or disable EVM gas sponsorship by default (true|false)")
    .action((enabled: string) => {
      try {
        const normalized = enabled.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          throw errInvalidArgs("evm-gas-sponsored must be 'true' or 'false'");
        }
        const evm_gas_sponsored = normalized === "true";
        const cfg = config.load();
        config.save({ ...cfg, evm_gas_sponsored });
        printHuman(
          `${green("✓")} Set evm-gas-sponsored to ${evm_gas_sponsored}\n`,
          { key: "evm-gas-sponsored", value: String(evm_gas_sponsored), status: "set" },
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("evm-gas-policy-id <id>")
    .description("Set the EVM gas policy ID for sponsored transactions")
    .action((id: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, evm_gas_policy_id: id });
        printHuman(`${green("✓")} Set evm-gas-policy-id\n`, { key: "evm-gas-policy-id", status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("solana-fee-sponsored <enabled>")
    .description("Enable or disable Solana fee sponsorship by default (true|false)")
    .action((enabled: string) => {
      try {
        const normalized = enabled.trim().toLowerCase();
        if (normalized !== "true" && normalized !== "false") {
          throw errInvalidArgs("solana-fee-sponsored must be 'true' or 'false'");
        }
        const solana_fee_sponsored = normalized === "true";
        const cfg = config.load();
        config.save({ ...cfg, solana_fee_sponsored });
        printHuman(
          `${green("✓")} Set solana-fee-sponsored to ${solana_fee_sponsored}\n`,
          { key: "solana-fee-sponsored", value: String(solana_fee_sponsored), status: "set" },
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("solana-fee-policy-id <id>")
    .description("Set the Solana fee policy ID for sponsored transactions")
    .action((id: string) => {
      try {
        const cfg = config.load();
        config.save({ ...cfg, solana_fee_policy_id: id });
        printHuman(`${green("✓")} Set solana-fee-policy-id\n`, { key: "solana-fee-policy-id", status: "set" });
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── config get ─────────────────────────────────────────────────────

  cmd
    .command("get <key>")
    .description("Get a config value (api-key, app, network, verbose, wallet-key-file, x402)")
    .action((key: string) => {
      const cfg = config.load();
      let value = config.get(cfg, key);
      let isDefault = false;

      // Return effective defaults for keys that have well-known defaults
      if (value === undefined) {
        const defaults: Record<string, string> = {
          network: "eth-mainnet",
          verbose: "false",
          x402: "false",
          evm_gas_sponsored: "false",
          solana_fee_sponsored: "false",
        };
        const normalizedKey = config.KEY_MAP[key] ?? key;
        const defaultValue = defaults[normalizedKey] ?? defaults[key];
        if (defaultValue !== undefined) {
          value = defaultValue;
          isDefault = true;
        }
      }

      if (value === undefined) {
        exitWithError(errNotFound(`config key '${key}'`));
      }
      const isSecret = key === "api-key" || key === "api_key";
      const display = isSecret ? maskIf(value!) : value!;
      const humanDisplay = isDefault ? `${display} ${dim("(default)")}` : display;
      printHuman(humanDisplay + "\n", { key, value: display, ...(isDefault && { default: true }) });
    });

  // ── config list ────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List all config values")
    .action(async () => {
      const cfg = config.load();
      const hasApiKeyMismatch = Boolean(
        cfg.api_key &&
          cfg.app?.apiKey &&
          cfg.api_key !== cfg.app.apiKey,
      );

      if (isJSONMode()) {
        printJSON(config.toMap(cfg));
        return;
      }

      const { resolveAuthToken } = await import("../lib/resolve.js");
      const validToken = resolveAuthToken(cfg);
      const authStatus = cfg.auth_token
        ? validToken
          ? `${green("✓")} authenticated${cfg.auth_token_expires_at ? ` ${dim(`(expires ${cfg.auth_token_expires_at})`)}` : ""}`
          : `${yellow("◆")} expired${cfg.auth_token_expires_at ? ` ${dim(`(${cfg.auth_token_expires_at})`)}` : ""}`
        : dim("(not set) — run 'alchemy auth' to log in");

      const pairs: Array<[string, string]> = [
        ["auth", authStatus],
        [
          "api-key",
          cfg.api_key
            ? `${hasApiKeyMismatch ? `${yellow("◆")} ` : ""}${maskIf(cfg.api_key)}`
            : dim("(not set)"),
        ],
        ["webhook-api-key", cfg.webhook_api_key ? maskIf(cfg.webhook_api_key) : dim("(not set)")],
        [
          "app",
          cfg.app
            ? `${cfg.app.name} ${dim(`(${cfg.app.id})`)}`
            : dim("(not set) — set automatically via 'alchemy auth' or 'config set app'"),
        ],
        ["network", cfg.network || dim("(not set, defaults to eth-mainnet)")],
        [
          "verbose",
          cfg.verbose !== undefined
            ? String(cfg.verbose)
            : dim("(not set, defaults to false)"),
        ],
        ["wallet-key-file", cfg.wallet_key_file || dim("(not set)")],
        ["wallet-address", cfg.wallet_address || dim("(not set)")],
        ["solana-wallet-key-file", cfg.solana_wallet_key_file || dim("(not set)")],
        ["solana-wallet-address", cfg.solana_wallet_address || dim("(not set)")],
        [
          "x402",
          cfg.x402 !== undefined
            ? String(cfg.x402)
            : dim("(not set, defaults to false)"),
        ],
        [
          "evm-gas-sponsored",
          cfg.evm_gas_sponsored !== undefined
            ? String(cfg.evm_gas_sponsored)
            : dim("(not set, defaults to false)"),
        ],
        ["evm-gas-policy-id", cfg.evm_gas_policy_id || dim("(not set)")],
        [
          "solana-fee-sponsored",
          cfg.solana_fee_sponsored !== undefined
            ? String(cfg.solana_fee_sponsored)
            : dim("(not set, defaults to false)"),
        ],
        ["solana-fee-policy-id", cfg.solana_fee_policy_id || dim("(not set)")],
      ];

      printKeyValue(pairs);

      if (hasApiKeyMismatch) {
        console.log("");
        console.log(
          `  ${yellow("◆")} ${dim("Warning: api-key differs from the selected app key. RPC commands use api-key; run 'alchemy config set app <app-id>' to resync.")}`,
        );
      }
    });

  // ── config reset ───────────────────────────────────────────────────

  cmd
    .command("reset [key]")
    .description("Reset config values (all or a specific key)")
    .option("-y, --yes", "Skip confirmation prompt for full reset")
    .action(async (key: string | undefined, options: { yes?: boolean }) => {
      try {
        if (key) {
          const mapped = RESET_KEY_MAP[key];
          if (!mapped) {
            throw errInvalidArgs(
              `invalid reset key '${key}' (valid: ${config.validKeys().join(", ")}, app)`,
            );
          }

          const cfg = config.load();
          const updated = { ...cfg };
          delete updated[mapped];
          config.save(updated);
          printHuman(`${green("✓")} Reset ${key}\n`, {
            status: "reset",
            key,
          });
          return;
        }

        if (!options.yes && isInteractiveAllowed(program)) {
          const proceed = await promptConfirm({
            message: "Reset all saved config values?",
            initialValue: false,
            cancelMessage: "Cancelled config reset.",
          });
          if (proceed === null) {
            return;
          }
          if (!proceed) {
            console.log(`  ${dim("Skipped config reset.")}`);
            return;
          }
        }

        config.save({});
        printHuman(`${green("✓")} Reset all config values\n`, {
          status: "reset",
          scope: "all",
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── config status ───────────────────────────────────────────────────

  cmd
    .command("status")
    .description("Show setup status and remediation commands")
    .action(() => {
      const status = getSetupStatus(config.load());
      if (isJSONMode()) {
        printJSON(status);
        return;
      }

      printKeyValue([
        ["Complete", status.complete ? "yes" : "no"],
        ["Satisfied by", status.satisfiedBy ?? dim("(none)")],
      ]);
      if (status.missing.length > 0) {
        console.log("");
        console.log(`  ${dim("Missing:")}`);
        for (const item of status.missing) {
          console.log(`  ${dim(`- ${item}`)}`);
        }
      }
      if (status.nextCommands.length > 0) {
        console.log("");
        console.log(`  ${dim("Next commands:")}`);
        for (const command of status.nextCommands) {
          console.log(`  ${dim(`- ${command}`)}`);
        }
      }
    });
}
