#!/usr/bin/env node

function isGlobalInstall() {
  return process.env.npm_config_global === "true";
}

function isCI() {
  return process.env.CI === "true";
}

if (isGlobalInstall() && !isCI()) {
  // Keep this concise so it stays readable in npm install output.
  console.log("");
  console.log("◆ Alchemy CLI installed");
  console.log("  Run `alchemy` to get started.");
  console.log("");
}
