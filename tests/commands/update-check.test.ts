import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("update-check command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("prints JSON status in JSON mode", async () => {
    const printJSON = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateStatus: () => ({
        currentVersion: "0.2.0",
        latestVersion: "0.3.0",
        updateAvailable: true,
        installCommand: "npm i -g @alchemy/cli@latest",
        checkedAt: 1_700_000_000_000,
      }),
    }));

    const { registerUpdateCheck } = await import(
      "../../src/commands/update-check.js"
    );
    const program = new Command();
    registerUpdateCheck(program);

    await program.parseAsync(["node", "test", "update-check"], { from: "node" });

    expect(printJSON).toHaveBeenCalledWith({
      currentVersion: "0.2.0",
      latestVersion: "0.3.0",
      updateAvailable: true,
      installCommand: "npm i -g @alchemy/cli@latest",
      checkedAt: 1_700_000_000_000,
    });
  });

  it("prints human status with a boxed summary", async () => {
    const printKeyValueBox = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      dim: (s: string) => s,
      printKeyValueBox,
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateStatus: () => ({
        currentVersion: "0.2.0",
        latestVersion: "0.3.0",
        updateAvailable: true,
        installCommand: "npm i -g @alchemy/cli@latest",
        checkedAt: 1_700_000_000_000,
      }),
    }));

    const { registerUpdateCheck } = await import(
      "../../src/commands/update-check.js"
    );
    const program = new Command();
    registerUpdateCheck(program);

    await program.parseAsync(["node", "test", "update-check"], { from: "node" });

    expect(printKeyValueBox).toHaveBeenCalledWith([
      ["Current version", "0.2.0"],
      ["Latest version", "0.3.0"],
      ["Update available", "yes"],
      ["Checked at", "2023-11-14T22:13:20.000Z"],
      ["Install", "npm i -g @alchemy/cli@latest"],
    ]);
  });
});
