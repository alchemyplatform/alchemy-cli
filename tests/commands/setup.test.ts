import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("setup command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("setup status prints JSON contract", async () => {
    const printJSON = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "api_test" }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      printKeyValueBox: vi.fn(),
      dim: (s: string) => s,
    }));

    const { registerSetup } = await import("../../src/commands/setup.js");
    const program = new Command();
    registerSetup(program);

    await program.parseAsync(["node", "test", "setup", "status"], { from: "node" });
    expect(printJSON).toHaveBeenCalledWith({
      complete: true,
      satisfiedBy: "api_key",
      missing: [],
      nextCommands: [],
    });
  });
});
