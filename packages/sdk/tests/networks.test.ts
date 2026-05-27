import { describe, expect, it } from "vitest";
import {
  fromAdminNetworkId,
  getRPCNetworks,
  nativeTokenSymbol,
  supportedWalletNetworks,
  toAdminNetworkId,
  walletNetworkToChain,
} from "../src/networks/index.js";

describe("network catalog helpers", () => {
  it("includes Monad RPC networks", () => {
    const monadNetworks = getRPCNetworks({ baseDomain: "example.com" })
      .filter((network) => network.family === "Monad");

    expect(monadNetworks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "monad-mainnet",
          isTestnet: false,
          name: "Monad Mainnet",
          httpsUrlTemplate: "https://monad-mainnet.g.example.com/v2/{apiKey}",
        }),
        expect.objectContaining({
          id: "monad-testnet",
          isTestnet: true,
          name: "Monad Testnet",
          httpsUrlTemplate: "https://monad-testnet.g.example.com/v2/{apiKey}",
        }),
      ]),
    );
  });

  it("converts between RPC slugs and Admin API network IDs", () => {
    expect(toAdminNetworkId("monad-testnet")).toBe("MONAD_TESTNET");
    expect(fromAdminNetworkId("MONAD_MAINNET")).toBe("monad-mainnet");
  });

  it("returns MON for Monad native token symbols", () => {
    expect(nativeTokenSymbol("monad-mainnet")).toBe("MON");
    expect(nativeTokenSymbol("monad-testnet")).toBe("MON");
  });

  it("parses native token families without regex backtracking", () => {
    expect(nativeTokenSymbol("eth-mainnetbeacon")).toBe("ETH");
    expect(nativeTokenSymbol("polygon-amoy")).toBe("POL");
    expect(nativeTokenSymbol("-amoy".repeat(1_000))).toBe("ETH");
  });
});

describe("wallet chain helpers", () => {
  it("maps Monad networks to viem chains", () => {
    expect(walletNetworkToChain("monad-mainnet")?.id).toBe(143);
    expect(walletNetworkToChain("monad-testnet")?.id).toBe(10143);
  });

  it("returns sorted wallet network support", () => {
    const networks = supportedWalletNetworks();

    expect(networks).toContain("monad-mainnet");
    expect(networks).toContain("monad-testnet");
    expect(networks).toEqual([...networks].sort());
  });
});
