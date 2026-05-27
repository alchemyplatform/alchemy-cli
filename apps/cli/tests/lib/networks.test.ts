import { describe, it, expect } from "vitest";
import {
  fromAdminNetworkId,
  getRPCNetworks,
  nativeTokenSymbol,
  toAdminNetworkId,
} from "../../src/lib/networks.js";

describe("admin network id helpers", () => {
  it("toAdminNetworkId converts kebab slugs to UPPER_SNAKE", () => {
    expect(toAdminNetworkId("eth-mainnet")).toBe("ETH_MAINNET");
    expect(toAdminNetworkId("base-mainnet")).toBe("BASE_MAINNET");
    expect(toAdminNetworkId("solana-mainnet")).toBe("SOLANA_MAINNET");
    expect(toAdminNetworkId("polygon-amoy")).toBe("POLYGON_AMOY");
  });

  it("fromAdminNetworkId is the inverse", () => {
    expect(fromAdminNetworkId("ETH_MAINNET")).toBe("eth-mainnet");
    expect(fromAdminNetworkId("SOLANA_MAINNET")).toBe("solana-mainnet");
    expect(fromAdminNetworkId(toAdminNetworkId("arb-sepolia"))).toBe("arb-sepolia");
  });

  it("trims surrounding whitespace", () => {
    expect(toAdminNetworkId("  eth-mainnet  ")).toBe("ETH_MAINNET");
    expect(fromAdminNetworkId("  ETH_MAINNET  ")).toBe("eth-mainnet");
  });
});

describe("RPC network catalog", () => {
  it("includes Monad networks", () => {
    const monadNetworks = getRPCNetworks().filter((network) => network.family === "Monad");

    expect(monadNetworks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "monad-mainnet",
          isTestnet: false,
          name: "Monad Mainnet",
        }),
        expect.objectContaining({
          id: "monad-testnet",
          isTestnet: true,
          name: "Monad Testnet",
        }),
      ]),
    );
  });
});

describe("nativeTokenSymbol", () => {
  it("returns MON for Monad networks", () => {
    expect(nativeTokenSymbol("monad-mainnet")).toBe("MON");
    expect(nativeTokenSymbol("monad-testnet")).toBe("MON");
  });
});
