import { describe, it, expect } from "vitest";
import { toAdminNetworkId, fromAdminNetworkId } from "../../src/lib/networks.js";

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
