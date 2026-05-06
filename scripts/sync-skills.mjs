import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Restore the shared skills recorded in skills-lock.json, overlay repo-local
// skills, and point Claude Code at the merged generated tree.

const git = (...args) =>
  execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();

const consumerRoot = git("rev-parse", "--show-toplevel");
const materializedRoot = path.join(consumerRoot, ".agents");
const materializedSkillsRoot = path.join(materializedRoot, "skills");
const overlaySkillsRoot = path.join(
  consumerRoot,
  ".local-agent-skills",
  "skills",
);
const skillsLockPath = path.join(consumerRoot, "skills-lock.json");

const removePath = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
};

const ensureDir = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
};

const copyDirectory = (sourcePath, destinationPath) => {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  fs.cpSync(sourcePath, destinationPath, { recursive: true });
};

const ensureSymlink = (linkPath, targetPath) => {
  const parentDir = path.dirname(linkPath);
  const relativeTarget = path.relative(parentDir, targetPath);

  ensureDir(parentDir);
  removePath(linkPath);
  fs.symlinkSync(relativeTarget, linkPath);
};

const restoreSharedSkills = () => {
  if (!fs.existsSync(skillsLockPath)) {
    throw new Error(
      "skills-lock.json not found. Generate it with `npx skills add OMGWINNING/internal-skills ...` and commit it.",
    );
  }

  const result = spawnSync("npx", ["--yes", "skills", "experimental_install"], {
    cwd: consumerRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log(
  `[sync-skills] generating ${path.relative(consumerRoot, materializedSkillsRoot)} from skills-lock.json`,
);

removePath(materializedSkillsRoot);
ensureDir(materializedSkillsRoot);
restoreSharedSkills();

copyDirectory(overlaySkillsRoot, materializedSkillsRoot);

ensureSymlink(
  path.join(consumerRoot, ".claude/skills"),
  materializedSkillsRoot,
);
removePath(path.join(consumerRoot, ".codex/skills"));
removePath(path.join(consumerRoot, ".cursor/skills"));
removePath(path.join(consumerRoot, ".continue/skills"));
