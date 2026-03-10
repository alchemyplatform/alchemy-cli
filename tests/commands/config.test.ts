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

describe("config command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "reset", "--yes"], {
      from: "node",
    });

    expect(load).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({});
    expect(confirm).not.toHaveBeenCalled();
    expect(printHuman).toHaveBeenCalledWith("\u2713 Reset all config values\n", {
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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

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
        ["api-key", "\u25C6 manual_api_key"],
      ]),
    );
    expect(logSpy).toHaveBeenCalledWith("");
    expect(logSpy).toHaveBeenCalledWith(
      "  \u25C6 Warning: api-key differs from the selected app key. RPC commands use api-key; run 'alchemy config set app <app-id>' to resync.",
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
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

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
    expect(printHuman).toHaveBeenCalledWith("\u2713 Set api-key\n", {
      key: "api-key",
      status: "set",
    });
    expect(logSpy).toHaveBeenCalledWith(
      "  \u25C6 Warning: api-key differs from the selected app key. RPC commands use api-key; run 'alchemy config set app <app-id>' to resync.",
    );
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
