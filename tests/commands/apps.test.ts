import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

type AppRecord = {
  id: string;
  name: string;
  apiKey: string;
  webhookApiKey: string;
  chainNetworks: unknown[];
  createdAt: string;
};

const APP_ONE: AppRecord = {
  id: "app_1",
  name: "First App",
  apiKey: "api_1",
  webhookApiKey: "wh_1",
  chainNetworks: [],
  createdAt: "2025-01-01T00:00:00.000Z",
};

const APP_TWO: AppRecord = {
  id: "app_2",
  name: "Second App",
  apiKey: "api_2",
  webhookApiKey: "wh_2",
  chainNetworks: [],
  createdAt: "2025-01-02T00:00:00.000Z",
};

describe("apps command", () => {
  it("lists one page by default in JSON mode", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const listApps = vi.fn().mockResolvedValue({ apps: [APP_ONE], cursor: "cursor_2" });
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, ["apps", "list"]);

    expect(listApps).toHaveBeenCalledWith({ cursor: undefined, limit: undefined });
    expect(printJSON).toHaveBeenCalledWith({ apps: [APP_ONE], cursor: "cursor_2" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("returns all pages in --all mode", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const listAllApps = vi.fn().mockResolvedValue({ apps: [APP_ONE, APP_TWO], pages: 2 });
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listAllApps }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, ["apps", "list", "--all"]);

    expect(listAllApps).toHaveBeenCalledWith({ limit: undefined });
    expect(printJSON).toHaveBeenCalledWith({
      apps: [APP_ONE, APP_TWO],
      pageInfo: {
        mode: "all",
        pages: 2,
        scannedApps: 2,
      },
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it.each([
    {
      title: "search filtering",
      args: ["apps", "list", "--search", "second"],
      expected: {
        apps: [APP_TWO],
        pageInfo: { mode: "search", pages: 1, scannedApps: 2, search: "second" },
      },
    },
    {
      title: "id filtering",
      args: ["apps", "list", "--id", "app_2"],
      expected: {
        apps: [APP_TWO],
        pageInfo: { mode: "search", pages: 1, scannedApps: 2, id: "app_2" },
      },
    },
  ])("applies %s in list mode", async ({ args, expected }) => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const listAllApps = vi.fn().mockResolvedValue({ apps: [APP_ONE, APP_TWO], pages: 1 });
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listAllApps }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, args);

    expect(listAllApps).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith(expected);
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("surfaces invalid list flag combinations through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps: vi.fn() }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, ["apps", "list", "--all", "--cursor", "abc"]);

    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0][0]).toMatchObject({ code: "INVALID_ARGS" });
  });

  it("supports create --dry-run preview output", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const createApp = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ createApp }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, [
      "apps",
      "create",
      "--name",
      "My App",
      "--networks",
      "eth-mainnet,base-mainnet",
      "--dry-run",
    ]);

    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "create",
      payload: {
        name: "My App",
        networks: ["eth-mainnet", "base-mainnet"],
      },
    });
    expect(createApp).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("deletes an app and returns JSON status", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const deleteApp = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ deleteApp }),
    }));

    const { registerApps } = await import("../../src/commands/apps.js");
    await runRegisteredCommand(registerApps, ["apps", "delete", "app_123"]);

    expect(deleteApp).toHaveBeenCalledWith("app_123");
    expect(printJSON).toHaveBeenCalledWith({ id: "app_123", status: "deleted" });
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
