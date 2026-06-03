import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAlchemyDataClient,
  createAlchemyDataClientFactory,
  limitPortfolioPayload,
  normalizePortfolioOutput,
} from "../src/data/index.js";

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

  it("normalizes portfolio hex balances and recursively limits arrays", () => {
    const payload = {
      data: [
        {
          balance: "0x0de0b6b3a7640000",
          tokenMetadata: { decimals: 18 },
          nested: [{ rawTokenBalance: "0x0a", metadata: { decimals: "1" } }, { balance: "0x01" }],
        },
        { balance: "0x02", decimals: 0 },
      ],
      untouched: "0x1234",
    };

    expect(normalizePortfolioOutput(limitPortfolioPayload(payload, 1))).toEqual({
      data: [
        {
          balance: "0x0de0b6b3a7640000",
          balanceDecimal: "1000000000000000000",
          balanceFormatted: "1",
          tokenMetadata: { decimals: 18 },
          nested: [
            {
              rawTokenBalance: "0x0a",
              rawTokenBalanceDecimal: "10",
              rawTokenBalanceFormatted: "1",
              metadata: { decimals: "1" },
            },
          ],
        },
      ],
      untouched: "0x1234",
    });
  });
});
