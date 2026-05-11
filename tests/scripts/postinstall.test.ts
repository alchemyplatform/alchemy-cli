import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("postinstall", () => {
  it("prints opt-in MCP and skills install hints for global installs", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-postinstall-"));
    const result = spawnSync(process.execPath, ["scripts/postinstall.cjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "false",
        HOME: home,
        SKIP_SKILL_SYNC: "1",
        npm_config_global: "true",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("◆ Alchemy CLI installed");
    expect(result.stdout).toContain("Run `alchemy` to get started.");
    expect(result.stdout).toContain("Run `alchemy install mcp`");
    expect(result.stdout).toContain("Run `alchemy install skills`");
    expect(result.stdout).not.toContain("--client all");
  });
});
