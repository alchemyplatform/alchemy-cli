import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DataApiError,
  dataGet,
  dataPost,
  nftBaseUrl,
  portfolioBaseUrl,
  pricesBaseUrl,
} from "../../src/clients/data.js";

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
      dataGet("https://eth-mainnet.g.example.com/nft/v3", "key-123", "/getNFTsForOwner", {
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

    await expect(
      dataPost("https://api.g.example.com/prices/v1", "key-123", "/tokens/by-symbol", {
        symbols: ["ETH"],
      }),
    ).resolves.toEqual({ prices: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.g.example.com/prices/v1/key-123/tokens/by-symbol",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
        },
        body: JSON.stringify({ symbols: ["ETH"] }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("maps non-2xx responses to DataApiError", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not enabled", { status: 403 }));

    await expect(dataGet("https://api.g.example.com/data/v1", "key-123", "/assets/tokens")).rejects.toMatchObject({
      name: "DataApiError",
      status: 403,
      message: "not enabled",
    });
  });

  it("uses gateway-domain helpers and validates NFT network IDs", () => {
    expect(nftBaseUrl("base-mainnet")).toBe("https://base-mainnet.g.example.com/nft/v3");
    expect(pricesBaseUrl()).toBe("https://api.g.example.com/prices/v1");
    expect(portfolioBaseUrl()).toBe("https://api.g.example.com/data/v1");
    expect(() => nftBaseUrl("base-mainnet.example.com")).toThrow("Invalid network identifier");
  });
});
