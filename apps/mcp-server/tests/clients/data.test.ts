import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataApiError, mcpDataClient } from "../../src/clients/data.js";

describe("Data API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.ALCHEMY_BASE_DOMAIN = "example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ALCHEMY_BASE_DOMAIN;
  });

  it("builds GET URLs with scalar and repeated query params", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ownedNfts: [] }), { status: 200 }));

    await expect(
      mcpDataClient.create("key-123").nft.getNFTsForOwner("eth-mainnet", {
        owner: "0xabc",
        "contractAddresses[]": ["0x1", "0x2"],
        pageKey: undefined,
      }),
    ).resolves.toEqual({ ownedNfts: [] });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://eth-mainnet.g.example.com/nft/v3/key-123/getNFTsForOwner");
    expect(url.searchParams.get("owner")).toBe("0xabc");
    expect(url.searchParams.getAll("contractAddresses[]")).toEqual(["0x1", "0x2"]);
    expect(url.searchParams.has("pageKey")).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
      },
    });
  });

  it("posts JSON bodies with Alchemy MCP breadcrumb headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ prices: [] }), { status: 200 }));

    const body = {
      addresses: [{ network: "eth-mainnet", address: "0xabc" }],
    };

    await expect(
      mcpDataClient.create("key-123").prices.getTokenPricesByAddress(body),
    ).resolves.toEqual({ prices: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.g.example.com/prices/v1/key-123/tokens/by-address",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
        },
        body: JSON.stringify(body),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("maps non-2xx responses to DataApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not enabled", { status: 403 }));

    const request = mcpDataClient.create("key-123").portfolio.getTokensByAddress({
      addresses: [{ address: "0xabc" }],
    });

    await expect(request).rejects.toThrow(DataApiError);
    await expect(request).rejects.toMatchObject({
      name: "DataApiError",
      status: 403,
      message: "not enabled",
    });
  });

  it("validates NFT network IDs before fetch", () => {
    expect(() =>
      mcpDataClient.create("key-123").nft.getNFTsForOwner("base-mainnet.example.com", {
        owner: "0xabc",
      }),
    ).toThrow("Invalid network identifier");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
