import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("tokens command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("tokens filters zero balances and prints token blocks", async () => {
    const call = vi.fn().mockResolvedValue({
      address: ADDRESS,
      tokenBalances: [
        { contractAddress: "0xzero", tokenBalance: "0x0" },
        { contractAddress: "0xnonzero", tokenBalance: "0x1234" },
      ],
    });
    const printTable = vi.fn();
    const printKeyValueBox = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const emptyState = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call, network: "eth-mainnet" }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable,
      printKeyValue: printKeyValueBox,
      printKeyValueBox,
      emptyState,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
      resolveAddress: vi.fn().mockResolvedValue(ADDRESS),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("stop"),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerData } = await import("../../src/commands/data.js");
    const program = new Command();
    registerData(program);

    await program.parseAsync(["node", "test", "data", "tokens", "balances", ADDRESS], {
      from: "node",
    });

    expect(call).toHaveBeenCalledWith("alchemy_getTokenBalances", [ADDRESS]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(emptyState).not.toHaveBeenCalled();
    expect(printKeyValueBox).toHaveBeenCalledWith([
      ["Address", ADDRESS],
      ["Network", "eth-mainnet"],
      ["Tokens", "1"],
    ]);
    expect(printTable).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("  Token 1");
    expect(log).toHaveBeenCalledWith("  Contract  0xnonzero");
    expect(log).toHaveBeenCalledWith("  Balance   4660");
    expect(log).toHaveBeenCalledWith("  Raw       0x1234");
    expect(log).toHaveBeenCalledWith(
      "\n  1 tokens (zero balances hidden).",
    );
    log.mockRestore();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("tokens forwards page-key params to RPC", async () => {
    const call = vi.fn().mockResolvedValue({
      address: ADDRESS,
      tokenBalances: [],
      pageKey: "p2",
    });
    const emptyState = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call, network: "eth-mainnet" }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable: vi.fn(),
      emptyState,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
      resolveAddress: vi.fn().mockResolvedValue(ADDRESS),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("stop"),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerData } = await import("../../src/commands/data.js");
    const program = new Command();
    registerData(program);

    await program.parseAsync(
      ["node", "test", "data", "tokens", "balances", ADDRESS, "--page-key", "pk_next"],
      { from: "node" },
    );

    expect(call).toHaveBeenCalledWith("alchemy_getTokenBalances", [
      ADDRESS,
      "erc20",
      { pageKey: "pk_next" },
    ]);
    expect(emptyState).toHaveBeenCalledWith("No token balances found.");
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("tokens metadata ignores whitespace-only symbols in human output", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "alchemy_getTokenMetadata") {
        return { name: "Whitespace Token", symbol: "   ", decimals: 2, logo: null };
      }
      return {
        address: ADDRESS,
        tokenBalances: [
          { contractAddress: "0xnonzero", tokenBalance: "0x7b" },
        ],
      };
    });
    const printKeyValueBox = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const emptyState = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call, network: "eth-mainnet" }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printKeyValue: printKeyValueBox,
      emptyState,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
      resolveAddress: vi.fn().mockResolvedValue(ADDRESS),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("stop"),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerData } = await import("../../src/commands/data.js");
    const program = new Command();
    registerData(program);

    await program.parseAsync(["node", "test", "data", "tokens", "balances", ADDRESS, "--metadata"], {
      from: "node",
    });

    expect(call).toHaveBeenCalledWith("alchemy_getTokenMetadata", ["0xnonzero"]);
    expect(log).toHaveBeenCalledWith("  Token 1");
    expect(log).toHaveBeenCalledWith("  Balance   1.23");
    expect(log).not.toHaveBeenCalledWith("  Balance   1.23    ");
    log.mockRestore();
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
