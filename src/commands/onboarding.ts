import type { Command } from "commander";
import { load as loadConfig, save as saveConfig } from "../lib/config.js";
import { promptText } from "../lib/terminal-ui.js";
import {
  brand,
  bold,
  brandedHelp,
  dim,
  green,
} from "../lib/ui.js";
import { getUpdateNoticeLines } from "../lib/update-check.js";

export async function runOnboarding(
  _program: Command,
  latestUpdate: string | null = null,
): Promise<boolean> {
  process.stdout.write(brandedHelp({ force: true }));
  console.log("");
  console.log(`  ${brand("◆")} ${bold("Welcome to Alchemy CLI")}`);
  console.log(`  ${dim("  ────────────────────────────────────")}`);
  console.log(`  ${dim("  Let's get you set up with authentication.")}`);
  console.log("");
  if (latestUpdate) {
    for (const line of getUpdateNoticeLines(latestUpdate)) {
      console.log(line);
    }
    console.log("");
  }

  const answer = await promptText({
    message: "Press Enter to open browser and link your Alchemy account",
    cancelMessage: "Skipped onboarding.",
  });
  if (answer === null) {
    return false;
  }

  const { performBrowserLogin, AUTH_PORT, getLoginUrl } = await import("../lib/auth.js");
  console.log(`  Opening browser to log in...`);
  console.log(`  ${dim(getLoginUrl(AUTH_PORT))}`);
  console.log(`  ${dim("Waiting for authentication...")}`);
  try {
    const result = await performBrowserLogin();
    const { saveCredentials } = await import("../lib/credential-storage.js");
    saveCredentials({
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
