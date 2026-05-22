import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const shouldSkipSkillSync = process.env.SKIP_SKILL_SYNC === "1";
const isCi = process.env.CI === "true";
const skillsLockPath = path.join(root, "skills-lock.json");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
};

const canAccessSharedSkills = () => {
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
};

if (shouldSkipSkillSync || !fs.existsSync(skillsLockPath)) {
  process.exit(0);
}

if (!canAccessSharedSkills()) {
  const message =
    "[postinstall] skipping shared skill sync because git cannot access OMGWINNING/internal-skills.";

  if (isCi) {
    console.error(`${message} CI should configure git auth before install.`);
    process.exit(1);
  }

  console.warn(
    `${message} Run \`pnpm sync:skills\` after GitHub auth is configured.`,
  );
  process.exit(0);
}

console.log("[postinstall] syncing shared skills from skills-lock.json");
const syncStatus = run("node", ["scripts/sync-skills.mjs"]);
process.exit(syncStatus);
