import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { weiToEth, timeAgo, etherscanTxURL } from "./ui.js";

describe("weiToEth", () => {
  it("converts zero", () => {
    expect(weiToEth(0n)).toBe("0.0");
  });

  it("converts 1 ETH", () => {
    expect(weiToEth(10n ** 18n)).toBe("1.0");
  });

  it("converts fractional ETH", () => {
    expect(weiToEth(1500000000000000000n)).toBe("1.5");
  });

  it("converts small wei amounts", () => {
    expect(weiToEth(1n)).toBe("0.000000000000000001");
  });

  it("converts large amounts", () => {
    expect(weiToEth(123456789000000000000n)).toBe("123.456789");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns seconds ago for recent timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const hex = "0x" + (now - 30).toString(16);
    expect(timeAgo(hex)).toBe("30 seconds ago");
  });

  it("returns minutes ago", () => {
    const now = Math.floor(Date.now() / 1000);
    const hex = "0x" + (now - 300).toString(16);
    expect(timeAgo(hex)).toBe("5 minutes ago");
  });

  it("returns hours ago", () => {
    const now = Math.floor(Date.now() / 1000);
    const hex = "0x" + (now - 7200).toString(16);
    expect(timeAgo(hex)).toBe("2 hours ago");
  });

  it("returns days ago", () => {
    const now = Math.floor(Date.now() / 1000);
    const hex = "0x" + (now - 172800).toString(16);
    expect(timeAgo(hex)).toBe("2 days ago");
  });

  it("returns original string for non-hex", () => {
    expect(timeAgo("notahex")).toBe("notahex");
  });
});

describe("etherscanTxURL", () => {
  it("returns etherscan URL for eth-mainnet", () => {
    expect(etherscanTxURL("0xabc", "eth-mainnet")).toBe(
      "https://etherscan.io/tx/0xabc",
    );
  });

  it("returns polygonscan URL for polygon-mainnet", () => {
    expect(etherscanTxURL("0xabc", "polygon-mainnet")).toBe(
      "https://polygonscan.com/tx/0xabc",
    );
  });

  it("returns arbiscan URL for arb-mainnet", () => {
    expect(etherscanTxURL("0xabc", "arb-mainnet")).toBe(
      "https://arbiscan.io/tx/0xabc",
    );
  });

  it("returns basescan URL for base-mainnet", () => {
    expect(etherscanTxURL("0xabc", "base-mainnet")).toBe(
      "https://basescan.org/tx/0xabc",
    );
  });

  it("returns undefined for unknown network", () => {
    expect(etherscanTxURL("0xabc", "unknown-net")).toBeUndefined();
  });

  it("returns sepolia URLs", () => {
    expect(etherscanTxURL("0xabc", "eth-sepolia")).toBe(
      "https://sepolia.etherscan.io/tx/0xabc",
    );
  });
});
