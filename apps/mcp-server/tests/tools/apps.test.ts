import { beforeEach, describe, expect, it, vi } from "vitest";

const getApp = vi.fn();
const listApps = vi.fn();
const createApp = vi.fn();
const updateApp = vi.fn();
const redisSet = vi.fn();

vi.mock("../../src/clients/admin.js", () => ({
  getApp,
  listApps,
  createApp,
  updateApp,
}));

vi.mock("../../src/redis.js", () => ({
  getRedisClient: () => ({
    set: redisSet,
  }),
}));

vi.mock("../../src/auth.js", () => ({
  hashToken: (token: string) => `hash:${token}`,
}));

const { registerAppTools } = await import("../../src/tools/apps.js");

const APP = {
  id: "app_123",
  name: "Test App",
  description: "Demo app",
  apiKey: "abcdefghijklmnop",
  webhookApiKey: "whsec",
  chainNetworks: [{ id: "ETH_MAINNET", name: "Ethereum", rpcUrl: "https://example.com" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

function appTool(name: string) {
  const tools = new Map<string, (...args: any[]) => Promise<any>>();
  registerAppTools({
    tool(toolName: string, _description: string, _schema: unknown, _annotations: unknown, handler: (...args: any[]) => Promise<any>) {
      tools.set(toolName, handler);
    },
  } as never);
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function text(result: { content: Array<{ text: string }> }): string {
  return result.content[0].text;
}

describe("app tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats paginated app lists and preserves cursor guidance", async () => {
    listApps.mockResolvedValueOnce({ apps: [APP], cursor: "next-page" });

    const result = await appTool("list_apps")({ limit: 10 }, { authInfo: { token: "user-token" } });

    expect(listApps).toHaveBeenCalledWith("user-token", { limit: 10, cursor: undefined });
    expect(text(result)).toContain("app_123 — Test App (Demo app)");
    expect(text(result)).toContain('Call list_apps with cursor: "next-page"');
  });

  it("returns actionable auth errors when auth info is absent", async () => {
    const result = await appTool("list_apps")({ limit: 10 }, { authInfo: undefined });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Not authenticated. Provide a valid Bearer token.");
    expect(listApps).not.toHaveBeenCalled();
  });

  it("selects an app by caching its API key under the authenticated token hash", async () => {
    getApp.mockResolvedValueOnce(APP);

    const result = await appTool("select_app")({ app_id: "app_123" }, { authInfo: { token: "user-token" } });

    expect(getApp).toHaveBeenCalledWith("user-token", "app_123");
    expect(redisSet).toHaveBeenCalledWith(
      "app:hash:user-token",
      JSON.stringify({
        apiKey: "abcdefghijklmnop",
        webhookApiKey: "whsec",
        appId: "app_123",
        appName: "Test App",
      }),
      "EX",
      90 * 24 * 60 * 60,
    );
    expect(text(result)).toBe('Selected app "Test App" (app_123). API key cached.');
  });

  it("masks API keys in get_app and create_app responses", async () => {
    getApp.mockResolvedValueOnce(APP);
    createApp.mockResolvedValueOnce(APP);

    const getResult = await appTool("get_app")({ app_id: "app_123" }, { authInfo: { token: "user-token" } });
    const createResult = await appTool("create_app")(
      { name: "Test App", chain_networks: ["ETH_MAINNET"] },
      { authInfo: { token: "user-token" } },
    );

    expect(text(getResult)).toContain("API Key: abcd********mnop");
    expect(text(createResult)).toContain("API Key: abcd********mnop");
    expect(text(getResult)).not.toContain("abcdefghijklmnop");
    expect(text(createResult)).not.toContain("abcdefghijklmnop");
  });

  it("normalizes RPC network slugs when creating apps", async () => {
    createApp.mockResolvedValueOnce(APP);

    await appTool("create_app")(
      { name: "Test App", chain_networks: ["monad-testnet"] },
      { authInfo: { token: "user-token" } },
    );

    expect(createApp).toHaveBeenCalledWith("user-token", {
      name: "Test App",
      networkAllowlist: ["MONAD_TESTNET"],
      description: undefined,
    });
  });

  it("updates apps with optional field payloads", async () => {
    updateApp.mockResolvedValueOnce({ ...APP, name: "Renamed" });

    const result = await appTool("update_app")(
      { app_id: "app_123", name: "Renamed" },
      { authInfo: { token: "user-token" } },
    );

    expect(updateApp).toHaveBeenCalledWith("user-token", "app_123", {
      name: "Renamed",
      description: undefined,
    });
    expect(text(result)).toBe('Updated app "Renamed" (app_123)');
  });
});
