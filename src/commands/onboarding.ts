import type { Command } from "commander";
import { AdminClient } from "../lib/admin-client.js";
import { load as loadConfig, save as saveConfig } from "../lib/config.js";
import { promptSelect, promptText } from "../lib/terminal-ui.js";
import {
  brand,
  bold,
  brandedHelp,
  dim,
  green,
  maskIf,
  printKeyValueBox,
} from "../lib/ui.js";
import { selectOrCreateApp } from "./config.js";
import { generateAndPersistWallet, importAndPersistWallet } from "./wallet.js";

type OnboardingMethod = "api-key" | "access-key" | "x402" | "exit";

function printNextSteps(method: Exclude<OnboardingMethod, "exit">): void {
  const commandsByMethod: Record<Exclude<OnboardingMethod, "exit">, string[]> = {
    "api-key": ["alchemy config set api-key <key>"],
    "access-key": [
      "alchemy config set access-key <key>",
      "alchemy config set app <app-id>",
    ],
    x402: [
      "alchemy wallet generate",
      "alchemy config set wallet-key-file <path>",
      "alchemy config set x402 true",
    ],
  };

  console.log("");
  console.log(`  ${dim("Next steps:")}`);
  for (const command of commandsByMethod[method]) {
    console.log(`  ${dim(`- ${command}`)}`);
  }
}

function printAPIKeyPostSetupGuidance(): void {
  const cfg = loadConfig() ?? {};
  const network = cfg.network ?? "eth-mainnet";

  console.log("");
  console.log(`  ${brand("◆")} ${bold("Your configuration")}`);
  printKeyValueBox([
    ["api-key", cfg.api_key ? maskIf(cfg.api_key) : dim("(not set)")],
    ["network", cfg.network ? network : `${network} ${dim("(default)")}`],
  ]);

  console.log("");
  console.log(`  ${brand("◆")} ${bold("Next steps")}`);
  printKeyValueBox([
    ["Verify setup", "rpc eth_chainId"],
    ["Need a different chain?", "config set network <network>"],
    ["List available chains", "network list"],
    ["View set API key", "config get api-key"],
    ["Need help?", "help"],
  ]);
}

async function runAPIKeyOnboarding(): Promise<void> {
  const key = await promptText({
    message: "Enter API Key",
    cancelMessage: "Skipped API key setup.",
    clearAfterSubmit: true,
  });
  if (!key || !key.trim()) return;
  const cfg = loadConfig();
  saveConfig({ ...cfg, api_key: key.trim() });
  console.log(`  ${green("✓")} Saved API key`);
}

async function runAccessKeyOnboarding(): Promise<void> {
  const key = await promptText({
    message: "Alchemy access key",
    placeholder: "Used for Admin API operations",
    cancelMessage: "Skipped access key setup.",
  });
  if (!key || !key.trim()) return;

  const cfg = loadConfig();
  saveConfig({ ...cfg, access_key: key.trim() });
  console.log(`  ${green("✓")} Saved access key`);
  await selectOrCreateApp(new AdminClient(key.trim()));
}

async function runX402Onboarding(): Promise<void> {
  const action = await promptSelect({
    message: "x402 wallet setup",
    options: [
      { label: "Generate a new wallet", value: "generate" },
      { label: "Import wallet from key file", value: "import" },
    ],
    initialValue: "generate",
    cancelMessage: "Skipped x402 setup.",
  });
  if (!action) return;

  const wallet =
    action === "generate"
      ? generateAndPersistWallet()
      : await (async () => {
          const path = await promptText({
            message: "Wallet private key file path",
            cancelMessage: "Skipped wallet import.",
          });
          if (!path || !path.trim()) return null;
          return importAndPersistWallet(path.trim());
        })();
  if (!wallet) return;

  const cfg = loadConfig();
  saveConfig({ ...cfg, x402: true });
  console.log(`  ${green("✓")} x402 enabled with wallet ${wallet.address}`);
}

export async function runOnboarding(_program: Command): Promise<boolean> {
  process.stdout.write(brandedHelp({ force: true }));
  console.log("");
  console.log(`  ${brand("◆")} ${bold("Welcome to Alchemy CLI")}`);
  console.log(`  ${dim("  ────────────────────────────────────")}`);
  console.log(`  ${dim("  Let's get you set up with authentication.")}`);
  console.log(`  ${dim("  Choose one auth path to continue.")}`);
  console.log(`  ${dim("  Tip: select 'exit' to skip setup for now.")}`);
  console.log("");
  const method = await promptSelect<OnboardingMethod>({
    message: "Choose an auth setup path",
    options: [
      {
        label: "API key",
        hint: "Query Alchemy RPC nodes",
        value: "api-key",
      },
      {
        label: "Access Key",
        hint: "Admin API plus RPC nodes",
        value: "access-key",
      },
      {
        label: "x402",
        hint: "Agentic API access and payment",
        value: "x402",
      },
      {
        label: "exit",
        value: "exit",
      },
    ],
    initialValue: "api-key",
    cancelMessage: "Skipped onboarding.",
  });
  if (!method) return false;
  if (method === "exit") {
    console.log(`  ${dim("Exited onboarding.")}`);
    return false;
  }

  if (method === "api-key") {
    await runAPIKeyOnboarding();
    const complete = Boolean(loadConfig().api_key?.trim());
    if (!complete) {
      printNextSteps("api-key");
    } else {
      printAPIKeyPostSetupGuidance();
    }
    return complete;
  }
  if (method === "access-key") {
    await runAccessKeyOnboarding();
    const cfg = loadConfig();
    const complete = Boolean(cfg.access_key?.trim() && cfg.app?.id && cfg.app.apiKey);
    if (!complete) {
      printNextSteps("access-key");
    }
    return complete;
  }
  await runX402Onboarding();
  const cfg = loadConfig();
  const complete = cfg.x402 === true && Boolean(cfg.wallet_key_file?.trim());
  if (!complete) {
    printNextSteps("x402");
  }
  return complete;
}
