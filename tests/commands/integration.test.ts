import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("command integration coverage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("balance reads stdin arg and prints JSON", async () => {
    const call = vi.fn().mockResolvedValue("0x10");
    const readStdinArg = vi.fn().mockResolvedValue(ADDRESS);
    const validateAddress = vi.fn();
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
      weiToEth: () => "0.000000000000000016",
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress,
      readStdinArg,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerBalance } = await import("../../src/commands/balance.js");
    const program = new Command();
    registerBalance(program);

    await program.parseAsync(["node", "test", "balance"], { from: "node" });

    expect(readStdinArg).toHaveBeenCalledWith("address");
    expect(validateAddress).toHaveBeenCalledWith(ADDRESS);
    expect(call).toHaveBeenCalledWith("eth_getBalance", [ADDRESS, "latest"]);
    expect(printJSON).toHaveBeenCalledWith({
      address: ADDRESS,
      wei: "16",
      eth: "0.000000000000000016",
      network: "eth-mainnet",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("nfts forwards pagination options in JSON mode", async () => {
    const callEnhanced = vi.fn().mockResolvedValue({
      ownedNfts: [],
      totalCount: 0,
      pageKey: "next-page",
    });
    const printJSON = vi.fn();
    const validateAddress = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ callEnhanced }),
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
      emptyState: vi.fn(),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress,
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

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

    expect(validateAddress).toHaveBeenCalledWith(ADDRESS);
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

  it("tokens filters zero balances and prints table rows", async () => {
    const call = vi.fn().mockResolvedValue({
      address: ADDRESS,
      tokenBalances: [
        { contractAddress: "0xzero", tokenBalance: "0x0" },
        { contractAddress: "0xnonzero", tokenBalance: "0x1234" },
      ],
    });
    const printTable = vi.fn();
    const emptyState = vi.fn();
    const validateAddress = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
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
      emptyState,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress,
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerTokens } = await import("../../src/commands/tokens.js");
    const program = new Command();
    registerTokens(program);

    await program.parseAsync(["node", "test", "tokens", ADDRESS], {
      from: "node",
    });

    expect(call).toHaveBeenCalledWith("alchemy_getTokenBalances", [ADDRESS]);
    expect(emptyState).not.toHaveBeenCalled();
    expect(printTable).toHaveBeenCalledWith(
      ["Contract", "Balance"],
      [["0xnonzero", "0x1234"]],
    );
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps create supports dry-run JSON payload", async () => {
    const printJSON = vi.fn();
    const adminClientFromFlags = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: vi.fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "create",
        "--name",
        "Demo App",
        "--networks",
        "eth-mainnet,polygon-mainnet",
        "--dry-run",
      ],
      { from: "node" },
    );

    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "create",
      payload: {
        name: "Demo App",
        networks: ["eth-mainnet", "polygon-mainnet"],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("config set verbose persists normalized boolean", async () => {
    const load = vi.fn().mockReturnValue({ api_key: "k" });
    const save = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printHuman: vi.fn(),
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "set", "verbose", "TRUE"], {
      from: "node",
    });

    expect(load).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ api_key: "k", verbose: true });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("tx emits combined JSON transaction + receipt payload", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ hash: HASH, from: "0xfrom", to: "0xto", value: "0x1" })
      .mockResolvedValueOnce({ status: "0x1", gasUsed: "0x5208" });
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
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateTxHash,
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      successBadge: () => "✓",
      failBadge: () => "✗",
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      weiToEth: (wei: bigint) => wei.toString(),
      etherscanTxURL: vi.fn(),
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerTx } = await import("../../src/commands/tx.js");
    const program = new Command();
    registerTx(program);

    await program.parseAsync(["node", "test", "tx", HASH], { from: "node" });

    expect(validateTxHash).toHaveBeenCalledWith(HASH);
    expect(call).toHaveBeenNthCalledWith(1, "eth_getTransactionByHash", [HASH]);
    expect(call).toHaveBeenNthCalledWith(2, "eth_getTransactionReceipt", [HASH]);
    expect(printJSON).toHaveBeenCalledWith({
      transaction: { hash: HASH, from: "0xfrom", to: "0xto", value: "0x1" },
      receipt: { status: "0x1", gasUsed: "0x5208" },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("balance forwards validation failures to exitWithError", async () => {
    const err = new Error("bad address");
    const validateAddress = vi.fn(() => {
      throw err;
    });
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call: vi.fn() }),
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
      weiToEth: () => "0",
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress,
      readStdinArg: vi.fn().mockResolvedValue(ADDRESS),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerBalance } = await import("../../src/commands/balance.js");
    const program = new Command();
    registerBalance(program);

    await program.parseAsync(["node", "test", "balance"], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(err);
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
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerNFTs } = await import("../../src/commands/nfts.js");
    const program = new Command();
    registerNFTs(program);

    await program.parseAsync(["node", "test", "nfts", ADDRESS], { from: "node" });

    expect(callEnhanced).toHaveBeenCalled();
    expect(emptyState).toHaveBeenCalledWith("No NFTs found.");
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
      clientFromFlags: () => ({ call }),
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
      printTable: vi.fn(),
      emptyState,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerTokens } = await import("../../src/commands/tokens.js");
    const program = new Command();
    registerTokens(program);

    await program.parseAsync(
      ["node", "test", "tokens", ADDRESS, "--page-key", "pk_next"],
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

  it("apps update requires at least one field", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: vi.fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "update", "app_1"], {
      from: "node",
    });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("config set verbose rejects invalid values", async () => {
    const load = vi.fn().mockReturnValue({ api_key: "k" });
    const save = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printHuman: vi.fn(),
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "set", "verbose", "yes"], {
      from: "node",
    });

    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
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
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateTxHash: vi.fn(),
      readStdinArg: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      successBadge: () => "✓",
      failBadge: () => "✗",
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      weiToEth: (wei: bigint) => wei.toString(),
      etherscanTxURL: vi.fn(),
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerTx } = await import("../../src/commands/tx.js");
    const program = new Command();
    registerTx(program);

    await program.parseAsync(["node", "test", "tx", HASH], { from: "node" });

    expect(call).toHaveBeenCalledWith("eth_getTransactionByHash", [HASH]);
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
