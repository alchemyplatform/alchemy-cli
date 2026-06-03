import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminApiError,
  createApp,
  listApps,
  updateAddressAllowlist,
  updateNetworkAllowlist,
} from "../../src/clients/admin.js";

const APP = {
  id: "app_123",
  name: "Test App",
  apiKey: "key-123",
  webhookApiKey: "whsec",
  chainNetworks: [{ id: "ETH_MAINNET", name: "Ethereum", rpcUrl: "https://example.com" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Admin API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.ALCHEMY_ADMIN_API_BASE_URL = "https://admin.example.com/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ALCHEMY_ADMIN_API_BASE_URL;
  });

  it("lists apps with auth headers and pagination query params", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { apps: [APP], cursor: "next" } }), { status: 200 }));

    await expect(listApps("auth-token", { cursor: "cur", limit: 5 })).resolves.toEqual({
      apps: [APP],
      cursor: "next",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://admin.example.com/v1/apps?cursor=cur&limit=5",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer auth-token",
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("creates apps using the Admin API body shape", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: APP }), { status: 200 }));

    await expect(
      createApp("auth-token", {
        name: "Test App",
        networkAllowlist: ["ETH_MAINNET"],
        description: "Demo",
      }),
    ).resolves.toEqual(APP);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: "Test App",
      networkAllowlist: ["ETH_MAINNET"],
      description: "Demo",
    });
  });

  it("updates allowlists using endpoint-specific payload names", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: APP }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ...APP, addressAllowlist: [{ value: "0xabc", name: "Owner" }] } }), {
          status: 200,
        }),
      );

    await updateNetworkAllowlist("auth-token", "app_123", ["ETH_MAINNET"]);
    await updateAddressAllowlist("auth-token", "app_123", [{ value: "0xabc", name: "Owner" }]);

    expect(fetchMock.mock.calls[0][0]).toBe("https://admin.example.com/v1/apps/app_123/networks");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ networkAllowlist: ["ETH_MAINNET"] });
    expect(fetchMock.mock.calls[1][0]).toBe("https://admin.example.com/v1/apps/app_123/address-allowlist");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      addressAllowlist: [{ value: "0xabc", name: "Owner" }],
    });
  });

  it.each([
    [401, "Invalid or expired auth token"],
    [403, "Access denied: forbidden"],
    [404, "Not found: /v1/apps"],
    [429, "Rate limited"],
    [500, "upstream down"],
  ])("maps HTTP %s responses to AdminApiError", async (status, message) => {
    fetchMock.mockResolvedValueOnce(new Response(status === 403 ? "forbidden" : status === 500 ? "upstream down" : "", { status }));

    await expect(listApps("auth-token")).rejects.toMatchObject({
      name: "AdminApiError",
      status,
      message,
    });
  });
});
