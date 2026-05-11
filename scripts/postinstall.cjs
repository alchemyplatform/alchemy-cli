#!/usr/bin/env node

const { existsSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

function isGlobalInstall() {
  return process.env.npm_config_global === "true";
}

function isCI() {
  return process.env.CI === "true";
}

function clearUpdateCache() {
  const home = process.env.HOME || require("node:os").homedir();
  const configHome = process.env.XDG_CONFIG_HOME || join(home, ".config");
  const cachePath = process.env.ALCHEMY_CONFIG
    ? process.env.ALCHEMY_CONFIG.replace(/config\.json$/, ".update-check")
    : join(configHome, "alchemy", ".update-check");
  try {
    unlinkSync(cachePath);
  } catch {
    // Cache file may not exist yet — that's fine.
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function canAccessSharedSkills() {
  const result = spawnSync(
    "git",
    ["ls-remote", "https://github.com/OMGWINNING/internal-skills.git", "HEAD"],
    {
      cwd: root,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    },
  );

  return result.status === 0;
}

function syncSkills() {
  const shouldSkipSkillSync = process.env.SKIP_SKILL_SYNC === "1";
  const skillsLockPath = join(root, "skills-lock.json");

  if (shouldSkipSkillSync || !existsSync(skillsLockPath)) {
    return;
  }

  if (!canAccessSharedSkills()) {
    const message =
      "[postinstall] skipping shared skill sync because git cannot access OMGWINNING/internal-skills.";

    if (isCI()) {
      console.error(`${message} CI should configure git auth before install.`);
      process.exit(1);
    }

    console.warn(
      `${message} Run \`pnpm sync:skills\` after GitHub auth is configured.`,
    );
    return;
  }

  console.log("[postinstall] syncing shared skills from skills-lock.json");
  const syncStatus = run("node", ["scripts/sync-skills.mjs"]);

  if (syncStatus !== 0) {
    process.exit(syncStatus);
  }
}

syncSkills();

if (isGlobalInstall() && !isCI()) {
  clearUpdateCache();
  console.log("");
  console.log("◆ Alchemy CLI installed");
  console.log("  Run `alchemy` to get started.");
  console.log("  Run `alchemy install mcp` to connect Alchemy MCP to an agent.");
  console.log("  Run `alchemy install skills` to install Alchemy agent skills.");
  console.log("");
}
