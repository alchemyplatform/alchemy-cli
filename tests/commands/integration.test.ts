import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeListAllApps(
  listApps: (opts: { cursor?: string; limit?: number }) => Promise<{ apps: unknown[]; cursor?: string }>,
) {
  return async (opts?: { limit?: number }) => {
    const apps: unknown[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listApps({
        ...(cursor && { cursor }),
        ...(opts?.limit !== undefined && { limit: opts.limit }),
      });
      pages += 1;
      apps.push(...page.apps);
      cursor = page.cursor;
      if (cursor && seenCursors.has(cursor)) break;
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return { apps, pages };
  };
}

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
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

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
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

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

  it("tokens filters zero balances and prints table rows", async () => {
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
    const validateAddress = vi.fn();
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
      printKeyValueBox,
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
    expect(call).toHaveBeenCalledTimes(1);
    expect(emptyState).not.toHaveBeenCalled();
    expect(printKeyValueBox).toHaveBeenCalledWith([
      ["Address", ADDRESS],
      ["Network", "eth-mainnet"],
      ["Non-zero tokens", "1"],
    ]);
    expect(printTable).toHaveBeenCalledWith(
      ["Contract", "Balance (base units)", "Raw (hex)"],
      [["0xnonzero", "4660", "0x1234"]],
    );
    expect(log).toHaveBeenCalledWith(
      "\n  Showing 1 of 2 contracts (non-zero only).",
    );
    log.mockRestore();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list is single-page in JSON mode by default", async () => {
    const listApps = vi
      .fn()
      .mockResolvedValue({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
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
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "list"], { from: "node" });

    expect(listApps).toHaveBeenCalledTimes(1);
    expect(listApps).toHaveBeenCalledWith({ cursor: undefined, limit: undefined });
    expect(printJSON).toHaveBeenCalledWith({
      apps: [
        {
          id: "app_1",
          name: "First App",
          apiKey: "api_1",
          webhookApiKey: "wh_1",
          chainNetworks: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      cursor: "cursor_2",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list with --cursor remains single-page in JSON mode", async () => {
    const listApps = vi.fn().mockResolvedValue({
      apps: [
        {
          id: "app_1",
          name: "Cursor App",
          apiKey: "api_1",
          webhookApiKey: "wh_1",
          chainNetworks: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      cursor: "cursor_2",
    });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
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
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(
      ["node", "test", "apps", "list", "--cursor", "abc"],
      { from: "node" },
    );

    expect(listApps).toHaveBeenCalledTimes(1);
    expect(listApps).toHaveBeenCalledWith({ cursor: "abc", limit: undefined });
    expect(printJSON).toHaveBeenCalledWith({
      apps: [
        {
          id: "app_1",
          name: "Cursor App",
          apiKey: "api_1",
          webhookApiKey: "wh_1",
          chainNetworks: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      cursor: "cursor_2",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list with --all paginates in JSON mode", async () => {
    const listApps = vi
      .fn()
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_2",
            name: "Second App",
            apiKey: "api_2",
            webhookApiKey: "wh_2",
            chainNetworks: [],
            createdAt: "2025-01-02T00:00:00.000Z",
          },
        ],
      });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps, listAllApps: makeListAllApps(listApps) }),
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
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "list", "--all"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(2);
    expect(listApps).toHaveBeenNthCalledWith(1, {});
    expect(listApps).toHaveBeenNthCalledWith(2, { cursor: "cursor_2" });
    expect(printJSON).toHaveBeenCalledWith({
      apps: [
        {
          id: "app_1",
          name: "First App",
          apiKey: "api_1",
          webhookApiKey: "wh_1",
          chainNetworks: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "app_2",
          name: "Second App",
          apiKey: "api_2",
          webhookApiKey: "wh_2",
          chainNetworks: [],
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      pageInfo: { mode: "all", pages: 2, scannedApps: 2 },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list --search filters by name or id in JSON mode", async () => {
    const listApps = vi
      .fn()
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        apps: [
          {
            id: "target_2",
            name: "Second Target",
            apiKey: "api_2",
            webhookApiKey: "wh_2",
            chainNetworks: [],
            createdAt: "2025-01-02T00:00:00.000Z",
          },
        ],
      });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps, listAllApps: makeListAllApps(listApps) }),
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
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "list", "--search", "target"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(2);
    expect(printJSON).toHaveBeenCalledWith({
      apps: [
        {
          id: "target_2",
          name: "Second Target",
          apiKey: "api_2",
          webhookApiKey: "wh_2",
          chainNetworks: [],
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      pageInfo: {
        mode: "search",
        pages: 2,
        scannedApps: 2,
        search: "target",
      },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list --id returns exact app match in JSON mode", async () => {
    const listApps = vi.fn().mockResolvedValue({
      apps: [
        {
          id: "app_1",
          name: "First App",
          apiKey: "api_1",
          webhookApiKey: "wh_1",
          chainNetworks: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "app_2",
          name: "Second App",
          apiKey: "api_2",
          webhookApiKey: "wh_2",
          chainNetworks: [],
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
    });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps, listAllApps: makeListAllApps(listApps) }),
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
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "list", "--id", "app_2"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      apps: [
        {
          id: "app_2",
          name: "Second App",
          apiKey: "api_2",
          webhookApiKey: "wh_2",
          chainNetworks: [],
          createdAt: "2025-01-02T00:00:00.000Z",
        },
      ],
      pageInfo: {
        mode: "search",
        pages: 1,
        scannedApps: 2,
        id: "app_2",
      },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list prompts to load next page in TTY mode", async () => {
    const listApps = vi
      .fn()
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_2",
            name: "Second App",
            apiKey: "api_2",
            webhookApiKey: "wh_2",
            chainNetworks: [],
            createdAt: "2025-01-02T00:00:00.000Z",
          },
        ],
      });
    const printTable = vi.fn();
    const emptyState = vi.fn();
    const exitWithError = vi.fn();
    const select = vi.fn().mockResolvedValue("next");
    const isCancel = vi.fn().mockReturnValue(false);
    const cancel = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: select,
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable,
      printKeyValueBox: vi.fn(),
      emptyState,
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "list"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(2);
    expect(listApps).toHaveBeenNthCalledWith(1, { cursor: undefined, limit: undefined });
    expect(listApps).toHaveBeenNthCalledWith(2, { cursor: "cursor_2", limit: undefined });
    expect(select).toHaveBeenCalledTimes(1);
    expect(printTable).toHaveBeenCalledTimes(2);
    expect(emptyState).not.toHaveBeenCalled();
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
      verbose: false,
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
    vi.doMock("../../src/lib/validators.js", async () => {
      const actual = await vi.importActual("../../src/lib/validators.js");
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
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
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

  it("config set access-key app selector includes paginated apps", async () => {
    const load = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ access_key: "ak_test" });
    const save = vi.fn();
    const printHuman = vi.fn();
    const select = vi.fn().mockResolvedValue("app_2");
    const isCancel = vi.fn().mockReturnValue(false);
    const cancel = vi.fn();
    const listApps = vi
      .fn()
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      })
      .mockResolvedValueOnce({
        apps: [
          {
            id: "app_2",
            name: "Second App",
            apiKey: "api_2",
            webhookApiKey: "wh_2",
            chainNetworks: [],
            createdAt: "2025-01-02T00:00:00.000Z",
          },
        ],
      });
    class MockAdminClient {
      constructor(_accessKey: string) {}
      listApps = listApps;
      listAllApps = makeListAllApps(listApps);
      listChains = vi.fn();
      createApp = vi.fn();
    }
    const exitWithError = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: MockAdminClient,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: select,
      promptAutocomplete: vi.fn(),
      promptText: vi.fn(),
      promptMultiselect: vi.fn(),
      promptConfirm: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printHuman,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "set", "access-key", "ak_test"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(2);
    expect(listApps).toHaveBeenNthCalledWith(1, {});
    expect(listApps).toHaveBeenNthCalledWith(2, { cursor: "cursor_2" });
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select default app",
        options: expect.arrayContaining([
          { label: "First App (app_1)", value: "app_1" },
          { label: "Second App (app_2)", value: "app_2" },
        ]),
      }),
    );
    expect(save).toHaveBeenNthCalledWith(1, { access_key: "ak_test" });
    expect(save).toHaveBeenNthCalledWith(2, {
      access_key: "ak_test",
      api_key: "api_2",
      app: { id: "app_2", name: "Second App", apiKey: "api_2" },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("config reset --yes clears all values without prompting", async () => {
    const load = vi.fn().mockReturnValue({
      api_key: "k",
      access_key: "ak",
      network: "eth-mainnet",
      verbose: true,
    });
    const save = vi.fn();
    const printHuman = vi.fn();
    const confirm = vi.fn();
    const exitWithError = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptConfirm: confirm,
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printHuman,
      printJSON: vi.fn(),
      verbose: false,
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

    await program.parseAsync(["node", "test", "config", "reset", "--yes"], {
      from: "node",
    });

    expect(load).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({});
    expect(confirm).not.toHaveBeenCalled();
    expect(printHuman).toHaveBeenCalledWith("✓ Reset all config values\n", {
      status: "reset",
      scope: "all",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("config reset <key> removes only the selected key", async () => {
    const load = vi.fn().mockReturnValue({
      api_key: "k",
      access_key: "ak",
      network: "polygon-mainnet",
      verbose: true,
    });
    const save = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      verbose: false,
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

    await program.parseAsync(["node", "test", "config", "reset", "network"], {
      from: "node",
    });

    expect(load).toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({
      api_key: "k",
      access_key: "ak",
      verbose: true,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("config reset rejects unknown keys", async () => {
    const load = vi.fn();
    const save = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      verbose: false,
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

    await program.parseAsync(["node", "test", "config", "reset", "unknown"], {
      from: "node",
    });

    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("config reset in non-tty mode does not prompt", async () => {
    const save = vi.fn();
    const confirm = vi.fn();
    const exitWithError = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn(),
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptConfirm: confirm,
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printHuman: vi.fn(),
      printJSON: vi.fn(),
      verbose: false,
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

    await program.parseAsync(["node", "test", "config", "reset"], {
      from: "node",
    });

    expect(save).toHaveBeenCalledWith({});
    expect(confirm).not.toHaveBeenCalled();
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
      verbose: false,
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
      verbose: false,
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
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      verbose: false,
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

  it("config list warns when api-key mismatches selected app key", async () => {
    const load = vi.fn().mockReturnValue({
      api_key: "manual_api_key",
      app: { id: "app_1", name: "First App", apiKey: "app_api_key" },
    });
    const printKeyValueBox = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save: vi.fn(),
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      yellow: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printKeyValueBox,
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError: vi.fn() }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "list"], {
      from: "node",
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(printKeyValueBox).toHaveBeenCalledTimes(1);
    expect(printKeyValueBox).toHaveBeenCalledWith(
      expect.arrayContaining([
        ["api-key", "◆ manual_api_key"],
      ]),
    );
    expect(logSpy).toHaveBeenCalledWith("");
    expect(logSpy).toHaveBeenCalledWith(
      "  ◆ Warning: api-key differs from the selected app key. RPC commands use api-key; run 'alchemy config set app <app-id>' to resync.",
    );
  });

  it("config set api-key warns when selected app key differs", async () => {
    const load = vi.fn().mockReturnValue({
      app: { id: "app_1", name: "First App", apiKey: "app_api_key" },
    });
    const save = vi.fn();
    const printHuman = vi.fn();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
      get: vi.fn(),
      toMap: vi.fn(),
      KEY_MAP: { "api-key": "api_key", api_key: "api_key", "access-key": "access_key", access_key: "access_key", network: "network", verbose: "verbose", "wallet-key-file": "wallet_key_file", wallet_key_file: "wallet_key_file", "wallet-address": "wallet_address", wallet_address: "wallet_address", x402: "x402" },
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
      printHuman,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      yellow: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printKeyValueBox: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "set", "api-key", "manual_api_key"], {
      from: "node",
    });

    expect(save).toHaveBeenCalledWith({
      app: { id: "app_1", name: "First App", apiKey: "app_api_key" },
      api_key: "manual_api_key",
    });
    expect(printHuman).toHaveBeenCalledWith("✓ Set api-key\n", {
      key: "api-key",
      status: "set",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "  ◆ Warning: api-key differs from the selected app key. RPC commands use api-key; run 'alchemy config set app <app-id>' to resync.",
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
