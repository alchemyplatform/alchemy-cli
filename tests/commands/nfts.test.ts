import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("nfts command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("nfts forwards pagination options in JSON mode", async () => {
    const callEnhanced = vi.fn().mockResolvedValue({
      ownedNfts: [],
      totalCount: 0,
      pageKey: "next-page",
    });
    const printJSON = vi.fn();
    const resolveAddress = vi.fn().mockResolvedValue(ADDRESS);
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ callEnhanced }),
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
      printTable: vi.fn(),
      emptyState: vi.fn(),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
      resolveAddress,
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("stop"),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerNFTs } = await import("../../src/commands/nfts.js");
    const program = new Command();
    registerNFTs(program);

    await program.parseAsync(
      [
        "node",
        "test",
        "nfts",
        ADDRESS,
        "--limit",
        "10",
        "--page-key",
        "pk_123",
      ],
      { from: "node" },
    );

    expect(resolveAddress).toHaveBeenCalledWith(ADDRESS, expect.anything());
    expect(callEnhanced).toHaveBeenCalledWith("getNFTsForOwner", {
      owner: ADDRESS,
      withMetadata: "true",
      pageSize: "10",
      pageKey: "pk_123",
    });
    expect(printJSON).toHaveBeenCalledWith({
      ownedNfts: [],
      totalCount: 0,
      pageKey: "next-page",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("nfts shows empty state in human mode", async () => {
    const callEnhanced = vi.fn().mockResolvedValue({
      ownedNfts: [],
      totalCount: 0,
    });
    const emptyState = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ callEnhanced }),
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
      printKeyValueBox: vi.fn(),
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

    const { registerNFTs } = await import("../../src/commands/nfts.js");
    const program = new Command();
    registerNFTs(program);

    await program.parseAsync(["node", "test", "nfts", ADDRESS], { from: "node" });

    expect(callEnhanced).toHaveBeenCalled();
    expect(emptyState).toHaveBeenCalledWith("No NFTs found.");
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
