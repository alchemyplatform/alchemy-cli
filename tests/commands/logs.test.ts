import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const SAMPLE_LOG = {
  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
  data: "0x000000000000000000000000000000000000000000000000000000003b9aca00",
  blockNumber: "0x112a880",
  transactionHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  transactionIndex: "0x0",
  blockHash: "0xdef456",
  logIndex: "0x0",
  removed: false,
};

describe("logs command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fetches logs and prints JSON", async () => {
    const call = vi.fn().mockResolvedValue([SAMPLE_LOG]);
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatHexQuantity: (v: string) => v,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerLogs } = await import("../../src/commands/logs.js");
    const program = new Command();
    registerLogs(program);

    await program.parseAsync(
      ["node", "test", "logs", "--from-block", "18000000", "--to-block", "18000010"],
      { from: "node" },
    );

    expect(call).toHaveBeenCalledWith("eth_getLogs", [
      {
        fromBlock: "0x112a880",
        toBlock: "0x112a88a",
      },
    ]);
    expect(printJSON).toHaveBeenCalledWith({
      logs: [SAMPLE_LOG],
      count: 1,
      network: "eth-mainnet",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("passes address and topic filters", async () => {
    const call = vi.fn().mockResolvedValue([]);
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatHexQuantity: (v: string) => v,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerLogs } = await import("../../src/commands/logs.js");
    const program = new Command();
    registerLogs(program);

    await program.parseAsync(
      [
        "node", "test", "logs",
        "--address", "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "--topic", "0xddf252ad",
        "--from-block", "latest",
        "--to-block", "latest",
      ],
      { from: "node" },
    );

    expect(call).toHaveBeenCalledWith("eth_getLogs", [
      {
        fromBlock: "latest",
        toBlock: "latest",
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        topics: ["0xddf252ad"],
      },
    ]);
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
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatHexQuantity: (v: string) => v,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerLogs } = await import("../../src/commands/logs.js");
    const program = new Command();
    registerLogs(program);

    await program.parseAsync(
      ["node", "test", "logs", "--from-block", "100", "--to-block", "200"],
      { from: "node" },
    );

    expect(exitWithError).toHaveBeenCalledWith(err);
  });

  it("paginates in interactive mode", async () => {
    // Generate 30 logs to trigger pagination (PAGE_SIZE = 25)
    const logs = Array.from({ length: 30 }, (_, i) => ({
      ...SAMPLE_LOG,
      logIndex: `0x${i.toString(16)}`,
    }));
    const call = vi.fn().mockResolvedValue(logs);
    const printTable = vi.fn();
    const promptSelect = vi.fn().mockResolvedValue("stop");
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      printTable,
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatHexQuantity: (v: string) => v,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerLogs } = await import("../../src/commands/logs.js");
    const program = new Command();
    registerLogs(program);

    await program.parseAsync(
      ["node", "test", "logs", "--from-block", "latest"],
      { from: "node" },
    );

    // First page of 25 rows printed
    expect(printTable).toHaveBeenCalledTimes(1);
    expect(printTable.mock.calls[0][1]).toHaveLength(25);
    // Pagination prompt shown
    expect(promptSelect).toHaveBeenCalledTimes(1);
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
