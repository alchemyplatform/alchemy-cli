import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("network command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("network list returns full catalog in JSON mode", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveNetwork: () => "eth-mainnet",
      resolveConfiguredNetworkSlugs: vi.fn(),
      resolveAppId: vi.fn(),
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
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(["node", "test", "network", "list"], {
      from: "node",
    });

    expect(exitWithError).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ id: string }>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(100);
    expect(payload.some((network) => network.id === "eth-mainnet")).toBe(true);
    expect(payload.some((network) => network.id === "base-mainnet")).toBe(true);
  });

  it("network list --configured returns configured app slugs", async () => {
    const printJSON = vi.fn();
    const resolveConfiguredNetworkSlugs = vi
      .fn()
      .mockResolvedValue(["eth-mainnet", "base-sepolia"]);
    const resolveAppId = vi.fn().mockReturnValue("app_123");
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveNetwork: () => "eth-mainnet",
      resolveConfiguredNetworkSlugs,
      resolveAppId,
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
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(
      ["node", "test", "network", "list", "--configured"],
      {
        from: "node",
      },
    );

    expect(resolveConfiguredNetworkSlugs).toHaveBeenCalledTimes(1);
    expect(resolveAppId).toHaveBeenCalledTimes(1);
    expect(exitWithError).not.toHaveBeenCalled();

    expect(printJSON).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "configured",
        appId: "app_123",
        configuredNetworkIds: ["eth-mainnet", "base-sepolia"],
      }),
    );
  });
});
