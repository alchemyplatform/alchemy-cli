#!/usr/bin/env node

const { unlinkSync } = require("node:fs");
const { join } = require("node:path");

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

if (isGlobalInstall() && !isCI()) {
  clearUpdateCache();
  console.log("");
  console.log("◆ Alchemy CLI installed");
  console.log("  Run `alchemy` to get started.");
  console.log("");
}
