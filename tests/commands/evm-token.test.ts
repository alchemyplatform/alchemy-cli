import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ARB_USDCE = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

function mockUI(opts: { json: boolean } = { json: false }) {
  const printJSON = vi.fn();
  const printKeyValue = vi.fn();
  const printTable = vi.fn();
  vi.doMock("../../src/lib/output.js", () => ({
    isJSONMode: () => opts.json,
    printJSON,
    verbose: false,
  }));
  vi.doMock("../../src/lib/ui.js", () => ({
    printKeyValue,
    printTable,
    green: (s: string) => s,
    dim: (s: string) => s,
  }));
  return { printJSON, printKeyValue, printTable };
}

function mockNetwork(network: string) {
  vi.doMock("../../src/lib/resolve.js", () => ({
    resolveNetwork: () => network,
  }));
}

describe("evm token command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("resolves ETH on eth-mainnet to the native sentinel (human output)", async () => {
    const { printKeyValue } = mockUI();
    mockNetwork("eth-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "ETH"], { from: "node" });

    expect(printKeyValue).toHaveBeenCalledTimes(1);
    const pairs = printKeyValue.mock.calls[0][0] as Array<[string, string]>;
    const dict = Object.fromEntries(pairs);
    expect(dict.Symbol).toBe("ETH");
    expect(dict.Address).toBe(NATIVE_TOKEN);
    expect(dict.Decimals).toBe("18");
    expect(dict.Network).toBe("eth-mainnet");
    expect(dict.Native).toBe("yes");
  });

  it("resolves USDC differently per network", async () => {
    {
      const { printJSON } = mockUI({ json: true });
      mockNetwork("eth-mainnet");
      const { registerEvmToken } = await import("../../src/commands/evm-token.js");
      const program = new Command();
      registerEvmToken(program);
      await program.parseAsync(["node", "test", "token", "USDC"], { from: "node" });
      expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
        symbol: "USDC",
        address: ETH_USDC,
        decimals: 6,
        network: "eth-mainnet",
      }));
    }

    vi.resetModules();

    {
      const { printJSON } = mockUI({ json: true });
      mockNetwork("base-mainnet");
      const { registerEvmToken } = await import("../../src/commands/evm-token.js");
      const program = new Command();
      registerEvmToken(program);
      await program.parseAsync(["node", "test", "token", "USDC"], { from: "node" });
      expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
        symbol: "USDC",
        address: BASE_USDC,
        network: "base-mainnet",
      }));
    }
  });

  it("matches symbols case-insensitively and supports aliases (USDCe -> USDC.e)", async () => {
    const { printJSON } = mockUI({ json: true });
    mockNetwork("arb-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "usdce"], { from: "node" });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      symbol: "USDC.e",
      address: ARB_USDCE,
      aliases: ["USDCe"],
    }));
  });

  it("--address-only prints just the address with no other output", async () => {
    mockUI();
    mockNetwork("eth-mainnet");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(
      ["node", "test", "token", "USDC", "--address-only"],
      { from: "node" },
    );

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(ETH_USDC);
  });

  it("returns a NOT_FOUND error when symbol is unknown on the network", async () => {
    const exitWithError = vi.fn();
    mockUI();
    mockNetwork("eth-mainnet");
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "DOGE"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
    const err = exitWithError.mock.calls[0][0];
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toContain(`token symbol "DOGE" on eth-mainnet`);
    expect(err.message).toContain("Known symbols:");
  });

  it("returns INVALID_ARGS for a network with no registry entries", async () => {
    const exitWithError = vi.fn();
    mockUI();
    mockNetwork("zksync-mainnet");
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "USDC"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
    const err = exitWithError.mock.calls[0][0];
    expect(err.code).toBe("INVALID_ARGS");
    expect(err.message).toContain("zksync-mainnet");
  });

  it("token list emits a single-network JSON payload by default", async () => {
    const { printJSON } = mockUI({ json: true });
    mockNetwork("base-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "list"], { from: "node" });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as { network: string; tokens: unknown[] };
    expect(payload.network).toBe("base-mainnet");
    expect(payload.tokens.length).toBeGreaterThan(0);
  });

  it("token list --all emits every supported network", async () => {
    const { printJSON } = mockUI({ json: true });
    mockNetwork("eth-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "list", "--all"], { from: "node" });

    expect(printJSON).toHaveBeenCalledTimes(1);
    const payload = printJSON.mock.calls[0][0] as Array<{ network: string }>;
    const networks = payload.map((p) => p.network);
    expect(networks).toContain("eth-mainnet");
    expect(networks).toContain("base-mainnet");
    expect(networks).toContain("arb-mainnet");
  });

  it("--address-only without a symbol raises INVALID_ARGS instead of silently listing", async () => {
    const exitWithError = vi.fn();
    mockUI();
    mockNetwork("eth-mainnet");
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "--address-only"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
    const err = exitWithError.mock.calls[0][0];
    expect(err.code).toBe("INVALID_ARGS");
    expect(err.message).toContain("--address-only requires a symbol");
  });

  it("token list JSON normalizes isNative to be present on every entry", async () => {
    const { printJSON } = mockUI({ json: true });
    mockNetwork("eth-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token", "list"], { from: "node" });

    const payload = printJSON.mock.calls[0][0] as { tokens: Array<{ symbol: string; isNative: boolean }> };
    for (const token of payload.tokens) {
      expect(typeof token.isNative).toBe("boolean");
    }
    expect(payload.tokens.find((t) => t.symbol === "ETH")?.isNative).toBe(true);
    expect(payload.tokens.find((t) => t.symbol === "USDC")?.isNative).toBe(false);
  });

  it("running `evm token` without a symbol falls through to list", async () => {
    const { printJSON } = mockUI({ json: true });
    mockNetwork("eth-mainnet");

    const { registerEvmToken } = await import("../../src/commands/evm-token.js");
    const program = new Command();
    registerEvmToken(program);

    await program.parseAsync(["node", "test", "token"], { from: "node" });

    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({ network: "eth-mainnet" }),
    );
  });
});
