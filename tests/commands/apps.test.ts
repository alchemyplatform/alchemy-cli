import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

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

describe("apps command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    await program.parseAsync(["node", "test", "apps", "update", "app_1"], {
      from: "node",
    });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("apps list skips interactive pagination when --no-interactive is set", async () => {
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
    const promptSelect = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
    }));
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
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    program.option("--no-interactive");
    registerApps(program);

    await program.parseAsync(["node", "test", "--no-interactive", "apps", "list"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(1);
    expect(promptSelect).not.toHaveBeenCalled();
  });
});

describe("apps dry-run JSON contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function setupAppsProgram() {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const adminClientFromFlags = vi.fn();

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    return { program, printJSON, exitWithError, adminClientFromFlags };
  }

  it("apps delete --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(["node", "test", "apps", "delete", "app_1", "--dry-run"], {
      from: "node",
    });
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "delete",
      payload: { id: "app_1" },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps update --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      ["node", "test", "apps", "update", "app_1", "--name", "Updated", "--dry-run"],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "update",
      payload: { id: "app_1", name: "Updated" },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps networks --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "networks",
        "app_1",
        "--networks",
        "eth-mainnet,base-mainnet",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "networks",
      payload: { id: "app_1", networks: ["eth-mainnet", "base-mainnet"] },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps address-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "address-allowlist",
        "app_1",
        "--addresses",
        "0xabc,0xdef",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "address-allowlist",
      payload: {
        id: "app_1",
        addresses: [{ value: "0xabc" }, { value: "0xdef" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps origin-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "origin-allowlist",
        "app_1",
        "--origins",
        "https://a.com,https://b.com",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "origin-allowlist",
      payload: {
        id: "app_1",
        origins: [{ value: "https://a.com" }, { value: "https://b.com" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps ip-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      ["node", "test", "apps", "ip-allowlist", "app_1", "--ips", "1.2.3.4,5.6.7.8", "--dry-run"],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "ip-allowlist",
      payload: {
        id: "app_1",
        ips: [{ value: "1.2.3.4" }, { value: "5.6.7.8" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
