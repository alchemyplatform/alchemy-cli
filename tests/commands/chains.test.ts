import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("chains command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("chains list prints JSON payload in json mode", async () => {
    const listChains = vi.fn().mockResolvedValue([
      {
        id: "ETH_MAINNET",
        name: "Ethereum Mainnet",
        isTestnet: false,
        availability: "public",
        currency: "ETH",
      },
    ]);
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listChains }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      green: (s: string) => s,
      printTable: vi.fn(),
      emptyState: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerChains } = await import("../../src/commands/chains.js");
    const program = new Command();
    registerChains(program);

    await program.parseAsync(["node", "test", "chains", "list"], { from: "node" });

    expect(listChains).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith([
      {
        id: "ETH_MAINNET",
        name: "Ethereum Mainnet",
        isTestnet: false,
        availability: "public",
        currency: "ETH",
      },
    ]);
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
