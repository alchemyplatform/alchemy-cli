import { describe, it, expect } from "vitest";
import { networkToChain, supportedNetworks } from "../../src/lib/chains.js";

describe("networkToChain", () => {
  it("maps eth-mainnet to mainnet chain", () => {
    const chain = networkToChain("eth-mainnet");
    expect(chain.id).toBe(1);
    expect(chain.name).toBe("Ethereum");
  });

  it("maps base-sepolia to base sepolia chain", () => {
    const chain = networkToChain("base-sepolia");
    expect(chain.id).toBe(84532);
  });

  it("maps arb-mainnet to arbitrum chain", () => {
    const chain = networkToChain("arb-mainnet");
    expect(chain.id).toBe(42161);
  });

  it("throws for unsupported network", () => {
    expect(() => networkToChain("solana-mainnet")).toThrow(/not supported for wallet operations/);
  });

  it("throws for unknown network", () => {
    expect(() => networkToChain("nonexistent")).toThrow(/not supported for wallet operations/);
  });
});

describe("supportedNetworks", () => {
  it("returns a sorted list of supported networks", () => {
    const networks = supportedNetworks();
    expect(networks.length).toBeGreaterThan(0);
    expect(networks).toContain("eth-mainnet");
    expect(networks).toContain("base-mainnet");
    // Verify sorted
    const sorted = [...networks].sort();
    expect(networks).toEqual(sorted);
  });
});
