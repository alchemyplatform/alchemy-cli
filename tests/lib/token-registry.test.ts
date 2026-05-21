import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import {
  NATIVE_TOKEN_ADDRESS,
  findRegistryToken,
  getRegistryNetworks,
  listRegistryTokens,
} from "../../src/lib/token-registry.js";

describe("token-registry", () => {
  it("every non-native address is a valid EIP-55 checksum", () => {
    for (const network of getRegistryNetworks()) {
      for (const token of listRegistryTokens(network)) {
        if (token.isNative) {
          expect(token.address).toBe(NATIVE_TOKEN_ADDRESS);
          continue;
        }
        expect(
          () => getAddress(token.address),
          `${network} ${token.symbol} (${token.address}) failed checksum`,
        ).not.toThrow();
        expect(
          token.address,
          `${network} ${token.symbol} has non-canonical checksum`,
        ).toBe(getAddress(token.address));
      }
    }
  });

  it("symbols and aliases are unique within each network", () => {
    for (const network of getRegistryNetworks()) {
      const seen = new Set<string>();
      for (const token of listRegistryTokens(network)) {
        const keys = [token.symbol, ...(token.aliases ?? [])].map((s) =>
          s.toUpperCase(),
        );
        for (const key of keys) {
          expect(
            seen.has(key),
            `${network} has duplicate symbol/alias ${key}`,
          ).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it("findRegistryToken matches case-insensitively and via aliases", () => {
    const arbUsdce = findRegistryToken("arb-mainnet", "USDC.e");
    expect(arbUsdce?.symbol).toBe("USDC.e");
    expect(findRegistryToken("arb-mainnet", "usdc.e")).toBe(arbUsdce);
    expect(findRegistryToken("arb-mainnet", "USDCe")).toBe(arbUsdce);
    expect(findRegistryToken("arb-mainnet", "  usdce  ")).toBe(arbUsdce);
  });

  it("findRegistryToken returns null for unknown symbol or network", () => {
    expect(findRegistryToken("eth-mainnet", "NOPE")).toBeNull();
    expect(findRegistryToken("does-not-exist-mainnet", "USDC")).toBeNull();
  });
});
