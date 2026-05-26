import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAlchemyDataClient, createAlchemyDataClientFactory } from "../src/data/index.js";

describe("SDK Data API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("routes NFT methods through the network NFT API base", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ownedNfts: [] }), { status: 200 }));

    const client = createAlchemyDataClient("key-123", {
      baseDomain: "example.com",
      breadcrumb: "test-client",
    });
    await expect(
      client.nft.getNFTsForOwner("eth-mainnet", {
        owner: "0xabc",
        "contractAddresses[]": ["0x1", "0x2"],
      }),
    ).resolves.toEqual({ ownedNfts: [] });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://eth-mainnet.g.example.com/nft/v3/key-123/getNFTsForOwner");
    expect(url.searchParams.getAll("contractAddresses[]")).toEqual(["0x1", "0x2"]);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": "test-client",
    });
  });

  it("routes Prices methods through the global prices API base", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ prices: [] }), { status: 200 }));

    const client = createAlchemyDataClient("key-123", { baseDomain: "example.com" });
    await expect(
      client.prices.getTokenPricesByAddress({
        addresses: [{ network: "eth-mainnet", address: "0xabc" }],
      }),
    ).resolves.toEqual({ prices: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.g.example.com/prices/v1/key-123/tokens/by-address",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ addresses: [{ network: "eth-mainnet", address: "0xabc" }] }),
      }),
    );
  });

  it("routes Portfolio methods through the global Data API base", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    const client = createAlchemyDataClient("key-123", { baseDomain: "example.com" });
    await expect(
      client.portfolio.getTokenBalancesByAddress({
        addresses: [{ address: "0xabc", networks: ["base-mainnet"] }],
      }),
    ).resolves.toEqual({ data: [] });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.g.example.com/data/v1/key-123/assets/tokens/balances/by-address",
    );
  });

  it("creates configured client factories with per-client overrides", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ prices: [] }), { status: 200 }));

    const clientFactory = createAlchemyDataClientFactory({
      baseDomain: "example.com",
      breadcrumb: "configured-client",
    });

    await expect(
      clientFactory.create("key-123", { breadcrumb: "request-client" }).prices.getTokenPricesBySymbol({
        symbols: ["ETH"],
      }),
    ).resolves.toEqual({ prices: [] });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.g.example.com/prices/v1/key-123/tokens/by-symbol?symbols=ETH");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-alchemy-client-breadcrumb": "request-client",
    });
  });
});
