import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("version command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("version uses printHuman output contract", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({ printHuman }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      brand: (s: string) => s,
    }));

    const { registerVersion } = await import("../../src/commands/version.js");
    const program = new Command();
    program.version("1.2.3");
    registerVersion(program);

    await program.parseAsync(["node", "test", "version"], { from: "node" });

    expect(printHuman).toHaveBeenCalledWith("  \u25C6 alchemy-cli 1.2.3\n", {
      version: "1.2.3",
    });
  });
});
