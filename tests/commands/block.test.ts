import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";
import {
  formatHexQuantity,
  formatBlockTimestamp,
  formatGasSummary,
} from "../../src/lib/block-format.js";

describe("block formatting helpers", () => {
  it("formats hex quantities with separators", () => {
    expect(formatHexQuantity("0x10")).toBe("16");
    expect(formatHexQuantity("0x2540be400")).toBe("10,000,000,000");
  });

  it("returns undefined for invalid quantities", () => {
    expect(formatHexQuantity("latest")).toBeUndefined();
    expect(formatHexQuantity(undefined)).toBeUndefined();
  });

  it("formats timestamps into ISO + relative text", () => {
    const out = formatBlockTimestamp("0x0");
    expect(out).toBeDefined();
    expect(out?.startsWith("1970-01-01T00:00:00Z")).toBe(true);
    expect(out).toContain("(");
  });

  it("formats gas usage with percentage", () => {
    expect(formatGasSummary("0x5f5e100", "0x7735940")).toBe(
      "100,000,000 / 125,000,000 (80.00%)",
    );
  });
});

describe("block command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("block forwards invalid block identifiers to exitWithError", async () => {
    const exitWithError = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatBlockTimestamp: vi.fn(),
      formatHexQuantity: vi.fn(),
      formatGasSummary: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerBlock } = await import("../../src/commands/block.js");
    const program = new Command();
    registerBlock(program);

    await program.parseAsync(["node", "test", "block", "abc"], { from: "node" });
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("block latest prints JSON payload in json mode", async () => {
    const call = vi.fn().mockResolvedValue({ number: "0x10", hash: "0xhash" });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printKeyValueBox: vi.fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatBlockTimestamp: vi.fn(),
      formatHexQuantity: vi.fn(),
      formatGasSummary: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerBlock } = await import("../../src/commands/block.js");
    const program = new Command();
    registerBlock(program);

    await program.parseAsync(["node", "test", "block", "latest"], { from: "node" });
    expect(call).toHaveBeenCalledWith("eth_getBlockByNumber", ["latest", false]);
    expect(printJSON).toHaveBeenCalledWith({ number: "0x10", hash: "0xhash" });
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
