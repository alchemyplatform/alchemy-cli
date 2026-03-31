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
import { getUpdateNoticeLines } from "../lib/update-check.js";
import { selectOrCreateApp } from "./config.js";
import { generateAndPersistWallet, importAndPersistWallet } from "./wallet.js";

type OnboardingMethod = "browser-login" | "api-key" | "access-key" | "siwx" | "exit";

function printNextSteps(method: Exclude<OnboardingMethod, "exit">): void {
  const commandsByMethod: Record<Exclude<OnboardingMethod, "exit">, string[]> = {
    "browser-login": ["alchemy auth"],
    "api-key": ["alchemy config set api-key <key>"],
    "access-key": [
      "alchemy config set access-key <key>",
      "alchemy config set app <app-id>",
    ],
    siwx: [
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

async function runSiwxOnboarding(): Promise<void> {
  const action = await promptSelect({
    message: "SIWx wallet setup",
    options: [
      { label: "Generate a new wallet", value: "generate" },
      { label: "Import wallet from key file", value: "import" },
    ],
    initialValue: "generate",
    cancelMessage: "Skipped SIWx setup.",
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
  console.log(`  ${green("✓")} SIWx enabled with wallet ${wallet.address}`);

  // Sign SIWE token immediately so it's cached for subsequent commands
  try {
    const { signSiwe } = await import("@alchemy/x402");
    const { readFileSync } = await import("node:fs");
    const keyPath = wallet.keyFile;
    const privateKey = readFileSync(keyPath, "utf-8").trim();
    const siweToken = await signSiwe({ privateKey, expiresAfter: "1h" });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    saveConfig({ ...loadConfig(), siwe_token: siweToken, siwe_token_expires_at: expiresAt });
    console.log(`  ${green("✓")} Signed SIWE token (cached for 1h)`);
  } catch {
    // Non-fatal — token will be signed on first API call
  }
}

export async function runOnboarding(
  _program: Command,
  latestUpdate: string | null = null,
): Promise<boolean> {
  process.stdout.write(brandedHelp({ force: true }));
  console.log("");
  console.log(`  ${brand("◆")} ${bold("Welcome to Alchemy CLI")}`);
  console.log(`  ${dim("  ────────────────────────────────────")}`);
  console.log(`  ${dim("  Let's get you set up with authentication.")}`);
  console.log(`  ${dim("  Choose one auth path to continue.")}`);
  console.log(`  ${dim("  Tip: select 'exit' to skip setup for now.")}`);
  console.log("");
  if (latestUpdate) {
    for (const line of getUpdateNoticeLines(latestUpdate)) {
      console.log(line);
    }
    console.log("");
  }
  const method = await promptSelect<OnboardingMethod>({
    message: "Choose an auth setup path",
    options: [
      {
        label: "Browser login",
        hint: "Log in via browser (recommended)",
        value: "browser-login",
      },
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
        label: "SIWx",
        hint: "Sign-In with Ethereum/Solana wallet",
        value: "siwx",
      },
      {
        label: "exit",
        value: "exit",
      },
    ],
    initialValue: "browser-login",
    cancelMessage: "Skipped onboarding.",
  });
  if (!method) return false;
  if (method === "exit") {
    console.log(`  ${dim("Exited onboarding.")}`);
    return false;
  }

  if (method === "browser-login") {
    const { performBrowserLogin, AUTH_PORT, getLoginUrl } = await import("../lib/auth.js");
    console.log(`  Opening browser to log in...`);
    console.log(`  ${dim(getLoginUrl(AUTH_PORT))}`);
    console.log(`  ${dim("Waiting for authentication...")}`);
    try {
      const result = await performBrowserLogin();
      const cfg = loadConfig();
      saveConfig({
        ...cfg,
        auth_token: result.token,
        auth_token_expires_at: result.expiresAt,
      });
      console.log(`  ${green("✓")} Logged in successfully`);
      const { selectAppAfterAuth } = await import("./auth.js");
      await selectAppAfterAuth(result.token);
      return true;
    } catch (err) {
      console.log(`  ${dim(`Login failed: ${err instanceof Error ? err.message : String(err)}`)}`);
      return false;
    }
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
  await runSiwxOnboarding();
  const cfg = loadConfig();
  const complete = cfg.x402 === true && Boolean(cfg.wallet_key_file?.trim());
  if (!complete) {
    printNextSteps("siwx");
  }
  return complete;
}
