import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("network command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function mockDeps(printJSON: ReturnType<typeof vi.fn>) {
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveNetwork: () => "eth-mainnet",
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
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError: vi.fn(),
    }));
  }

  it("network list returns full catalog in JSON mode", async () => {
    const printJSON = vi.fn();
    mockDeps(printJSON);

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(["node", "test", "network", "list"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ id: string }>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(100);
    expect(payload.some((network) => network.id === "eth-mainnet")).toBe(true);
    expect(payload.some((network) => network.id === "base-mainnet")).toBe(true);
  });

  it("network list --mainnet-only filters out testnets", async () => {
    const printJSON = vi.fn();
    mockDeps(printJSON);

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(["node", "test", "network", "list", "--mainnet-only"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ id: string; isTestnet: boolean }>;
    expect(payload.length).toBeGreaterThan(0);
    expect(payload.every((n) => !n.isTestnet)).toBe(true);
  });

  it("network list --testnet-only filters out mainnets", async () => {
    const printJSON = vi.fn();
    mockDeps(printJSON);

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(["node", "test", "network", "list", "--testnet-only"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ id: string; isTestnet: boolean }>;
    expect(payload.length).toBeGreaterThan(0);
    expect(payload.every((n) => n.isTestnet)).toBe(true);
  });

  it("network list --search filters by term", async () => {
    const printJSON = vi.fn();
    mockDeps(printJSON);

    const { registerNetwork } = await import("../../src/commands/network.js");
    const program = new Command();
    registerNetwork(program);

    await program.parseAsync(["node", "test", "network", "list", "--search", "polygon"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ id: string; name: string; family: string }>;
    expect(payload.length).toBeGreaterThan(0);
    expect(
      payload.every(
        (n) =>
          n.id.toLowerCase().includes("polygon") ||
          n.name.toLowerCase().includes("polygon") ||
          n.family.toLowerCase().includes("polygon"),
      ),
    ).toBe(true);
  });
});
