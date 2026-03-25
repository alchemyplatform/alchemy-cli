import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("gas command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("prints gas prices in JSON mode", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce("0x3b9aca00") // eth_gasPrice = 1 gwei
      .mockResolvedValueOnce("0x77359400"); // eth_maxPriorityFeePerGas = 2 gwei
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
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatGwei: (v: number) => v.toFixed(2),
      formatGweiWithRaw: (v: string) => v,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerGas } = await import("../../src/commands/gas.js");
    const program = new Command();
    registerGas(program);

    await program.parseAsync(["node", "test", "gas"], { from: "node" });

    expect(call).toHaveBeenCalledWith("eth_gasPrice", []);
    expect(call).toHaveBeenCalledWith("eth_maxPriorityFeePerGas", []);
    expect(printJSON).toHaveBeenCalledWith({
      gasPrice: "0x3b9aca00",
      gasPriceGwei: "1.00",
      network: "eth-mainnet",
      maxPriorityFeePerGas: "0x77359400",
      maxPriorityFeePerGasGwei: "2.00",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("uses full precision for sub-gwei values in JSON mode", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce("0x2839fa7") // ~0.042 gwei
      .mockResolvedValueOnce("0x344e"); // ~0.0000134 gwei
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
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", async () => (await vi.importActual("../../src/lib/block-format.js")));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerGas } = await import("../../src/commands/gas.js");
    const program = new Command();
    registerGas(program);

    await program.parseAsync(["node", "test", "gas"], { from: "node" });

    const result = printJSON.mock.calls[0][0];
    // Should NOT be "0.04" or "0.00" — should show meaningful precision
    expect(result.gasPriceGwei).toBe("0.042180519");
    expect(result.maxPriorityFeePerGasGwei).toBe("0.00001339");
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("handles chains without maxPriorityFeePerGas", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce("0x3b9aca00") // eth_gasPrice = 1 gwei
      .mockRejectedValueOnce(new Error("method not supported")); // eth_maxPriorityFeePerGas fails
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "arb-mainnet",
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
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatGwei: (v: number) => v.toFixed(2),
      formatGweiWithRaw: (v: string) => v,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerGas } = await import("../../src/commands/gas.js");
    const program = new Command();
    registerGas(program);

    await program.parseAsync(["node", "test", "gas"], { from: "node" });

    expect(printJSON).toHaveBeenCalledWith({
      gasPrice: "0x3b9aca00",
      gasPriceGwei: "1.00",
      network: "arb-mainnet",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("forwards errors to exitWithError", async () => {
    const err = new Error("rpc fail");
    const call = vi.fn().mockRejectedValue(err);
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
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
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatGwei: (v: number) => v.toFixed(2),
      formatGweiWithRaw: (v: string) => v,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerGas } = await import("../../src/commands/gas.js");
    const program = new Command();
    registerGas(program);

    await program.parseAsync(["node", "test", "gas"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(err);
  });
});
