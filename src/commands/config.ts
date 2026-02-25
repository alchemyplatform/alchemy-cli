import { Command } from "commander";
import * as config from "../lib/config.js";
import { AdminClient } from "../lib/admin-client.js";
import type { App } from "../lib/admin-client.js";
import { errNotFound, errAccessKeyRequired, errInvalidArgs } from "../lib/errors.js";
import { printHuman, printJSON, isJSONMode } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { green, dim, printKeyValueBox, emptyState } from "../lib/ui.js";

async function saveAppWithPrompt(app: App): Promise<boolean> {
  const cfg = config.load();
  const updated: config.Config = {
    ...cfg,
    app: { id: app.id, name: app.name, apiKey: app.apiKey },
  };

  // If user has a manually-set api-key, ask whether to replace it
  if (cfg.api_key) {
    const { confirm, isCancel, cancel } = await import("@clack/prompts");
    const replace = await confirm({
      message:
        "You already have an API key configured. Use the app's API key instead?",
      initialValue: true,
    });
    if (isCancel(replace)) {
      cancel("Cancelled default app update.");
      return false;
    }
    if (replace) {
      delete updated.api_key;
    }
  }

  config.save(updated);
  return true;
}

async function selectOrCreateApp(admin: AdminClient): Promise<void> {
  const { select, text, multiselect, confirm, isCancel, cancel } = await import(
    "@clack/prompts"
  );

  let apps: Awaited<ReturnType<typeof admin.listApps>>;
  try {
    apps = await admin.listApps();
  } catch {
    console.log(
      `  ${dim("Could not fetch apps. Skipping app selection.")}`,
    );
    return;
  }

  if (apps.apps.length > 0) {
    const CREATE_NEW = "__create_new__";
    const options = [
      ...apps.apps.map((a) => ({
        label: `${a.name} (${a.id})`,
        value: a.id,
      })),
      { label: "Create a new app", value: CREATE_NEW },
    ];

    const selected = await select({
      message: "Select an app to use as default:",
      options,
    });
    if (isCancel(selected)) {
      cancel("Cancelled app selection.");
      return;
    }

    if (selected !== CREATE_NEW) {
      const app = apps.apps.find((a) => a.id === selected)!;
      const saved = await saveAppWithPrompt(app);
      if (saved) {
        console.log(`${green("✓")} Default app set to ${app.name} (${app.id})`);
      } else {
        console.log(`  ${dim("Skipped setting default app.")}`);
      }
      return;
    }
  } else {
    console.log(`  ${dim("No apps found. Let's create one.")}`);
  }

  // Create flow
  const name = await text({ message: "App name:" });
  if (isCancel(name)) {
    cancel("Cancelled app creation.");
    return;
  }
  if (!name.trim()) {
    console.log(`  ${dim("Skipped app creation.")}`);
    return;
  }

  // Fetch chains for network selection
  let chainChoices: Array<{ label: string; value: string }> = [];
  try {
    const chains = await admin.listChains();
    chainChoices = chains
      .filter((c) => c.availability === "public" && !c.isTestnet)
      .map((c) => ({ label: `${c.name} (${c.id})`, value: c.id }));
  } catch {
    // Fallback to manual input if chains API fails
  }

  let networks: string[];
  if (chainChoices.length > 0) {
    const selectedNetworks = await multiselect({
      message: "Select networks:",
      options: chainChoices,
      required: true,
    });
    if (isCancel(selectedNetworks)) {
      cancel("Cancelled network selection.");
      return;
    }
    networks = selectedNetworks;
  } else {
    const raw = await text({
      message: "Network IDs (comma-separated):",
    });
    if (isCancel(raw)) {
      cancel("Cancelled network selection.");
      return;
    }
    networks = raw.split(",").map((s) => s.trim()).filter(Boolean);
  }

  if (networks.length === 0) {
    console.log(`  ${dim("No networks selected. Skipped app creation.")}`);
    return;
  }

  try {
    const app = await admin.createApp({ name: name.trim(), networks });
    console.log(`${green("✓")} Created app ${app.name} (${app.id})`);

    const setDefault = await confirm({
      message: "Set as default app?",
      initialValue: true,
    });
    if (isCancel(setDefault)) {
      cancel("Cancelled default app selection.");
      return;
    }

    if (setDefault) {
      const saved = await saveAppWithPrompt(app);
      if (saved) {
        console.log(`${green("✓")} Default app set to ${app.name} (${app.id})`);
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
    .description("Set the Alchemy API key for RPC requests")
    .action((key: string) => {
      const cfg = config.load();
      config.save({ ...cfg, api_key: key });
      printHuman(`${green("✓")} Set api-key\n`, { key: "api-key", status: "set" });
    });

  setCmd
    .command("access-key <key>")
    .description("Set the Alchemy access key for Admin API operations")
    .action(async (key: string) => {
      const cfg = config.load();
      config.save({ ...cfg, access_key: key });
      printHuman(`${green("✓")} Set access-key\n`, { key: "access-key", status: "set" });

      // Trigger onboarding in TTY mode
      if (process.stdin.isTTY && !isJSONMode()) {
        await selectOrCreateApp(new AdminClient(key));
      }
    });

  setCmd
    .command("app")
    .description("Select the default app (requires access key)")
    .action(async () => {
      try {
        const cfg = config.load();
        const accessKey =
          program.opts().accessKey ||
          process.env.ALCHEMY_ACCESS_KEY ||
          cfg.access_key;

        if (!accessKey) throw errAccessKeyRequired();

        if (!process.stdin.isTTY || isJSONMode()) {
          exitWithError(
            new Error("Interactive app selection requires a TTY. Use 'alchemy apps list' and set the app via the Admin API."),
          );
        }

        await selectOrCreateApp(new AdminClient(accessKey));
      } catch (err) {
        exitWithError(err);
      }
    });

  setCmd
    .command("network <network>")
    .description("Set the default network (e.g. eth-mainnet, polygon-mainnet)")
    .action((network: string) => {
      const cfg = config.load();
      config.save({ ...cfg, network });
      printHuman(`${green("✓")} Set network to ${network}\n`, { key: "network", value: network, status: "set" });
    });

  setCmd
    .command("verbose <enabled>")
    .description("Set default verbose output (true|false)")
    .action((enabled: string) => {
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
    });

  // ── config get ─────────────────────────────────────────────────────

  cmd
    .command("get <key>")
    .description("Get a config value (api-key, access-key, network, verbose)")
    .action((key: string) => {
      const cfg = config.load();
      const value = config.get(cfg, key);
      if (value === undefined) {
        exitWithError(errNotFound(`config key '${key}'`));
      }
      printHuman(value + "\n", { key, value });
    });

  // ── config list ────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List all config values")
    .action(() => {
      const cfg = config.load();

      if (isJSONMode()) {
        printJSON(config.toMap(cfg));
        return;
      }

      const pairs: Array<[string, string]> = [
        ["api-key", cfg.api_key || dim("(not set)")],
        ["access-key", cfg.access_key || dim("(not set)")],
        [
          "app",
          cfg.app
            ? `${cfg.app.name} ${dim(`(${cfg.app.id})`)}`
            : dim("(not set) — set automatically via 'config set access-key' or 'config set app'"),
        ],
        ["network", cfg.network || dim("(not set, defaults to eth-mainnet)")],
        [
          "verbose",
          cfg.verbose !== undefined
            ? String(cfg.verbose)
            : dim("(not set, defaults to false)"),
        ],
      ];

      printKeyValueBox(pairs);
    });
}
