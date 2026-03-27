import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("tx command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("tx emits JSON transaction payload (no receipt)", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ hash: HASH, from: "0xfrom", to: "0xto", value: "0x1" });
    const printJSON = vi.fn();
    const validateTxHash = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      verbose: false,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateTxHash,
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      etherscanTxURL: vi.fn(),
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerTx } = await import("../../src/commands/tx.js");
    const program = new Command();
    registerTx(program);

    await program.parseAsync(["node", "test", "tx", HASH], { from: "node" });

    expect(validateTxHash).toHaveBeenCalledWith(HASH);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("eth_getTransactionByHash", [HASH]);
    expect(printJSON).toHaveBeenCalledWith(
      { hash: HASH, from: "0xfrom", to: "0xto", value: "0x1" },
    );
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("tx forwards not-found case to exitWithError", async () => {
    const call = vi.fn().mockResolvedValueOnce(null);
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateTxHash: vi.fn(),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      successBadge: () => "\u2713",
      failBadge: () => "\u2717",
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      weiToEth: (wei: bigint) => wei.toString(),
      etherscanTxURL: vi.fn(),
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerTx } = await import("../../src/commands/tx.js");
    const program = new Command();
    registerTx(program);

    await program.parseAsync(["node", "test", "tx", HASH], { from: "node" });

    expect(call).toHaveBeenCalledWith("eth_getTransactionByHash", [HASH]);
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
