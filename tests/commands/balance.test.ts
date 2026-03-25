import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("balance command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("balance reads stdin arg and prints JSON", async () => {
    const call = vi.fn().mockResolvedValue("0x10");
    const readStdinArg = vi.fn().mockResolvedValue(ADDRESS);
    const resolveAddress = vi.fn().mockResolvedValue(ADDRESS);
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
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
      weiToEth: () => "0.000000000000000016",
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress,
      readStdinArg,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "ETH",
    }));

    const { registerBalance } = await import("../../src/commands/balance.js");
    const program = new Command();
    registerBalance(program);

    await program.parseAsync(["node", "test", "balance"], { from: "node" });

    expect(readStdinArg).toHaveBeenCalledWith("address");
    expect(resolveAddress).toHaveBeenCalledWith(ADDRESS, expect.anything());
    expect(call).toHaveBeenCalledWith("eth_getBalance", [ADDRESS, "latest"]);
    expect(printJSON).toHaveBeenCalledWith({
      address: ADDRESS,
      wei: "16",
      balance: "0.000000000000000016",
      symbol: "ETH",
      network: "eth-mainnet",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("balance forwards validation failures to exitWithError", async () => {
    const err = new Error("bad address");
    const resolveAddress = vi.fn().mockRejectedValue(err);
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call: vi.fn() }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      weiToEth: () => "0",
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress,
      readStdinArg: vi.fn().mockResolvedValue(ADDRESS),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "ETH",
    }));

    const { registerBalance } = await import("../../src/commands/balance.js");
    const program = new Command();
    registerBalance(program);

    await program.parseAsync(["node", "test", "balance"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(err);
  });
});
