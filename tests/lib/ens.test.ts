import { describe, it, expect } from "vitest";
import { namehash, dnsEncode, isENSName } from "../../src/lib/ens.js";

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("ENS utilities", () => {
  describe("namehash", () => {
    it("returns 32 zero bytes for empty string", () => {
      const result = namehash("");
      expect(bytesToHex(result)).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      );
    });

    it("computes correct namehash for eth", () => {
      // Known value from EIP-137
      expect(bytesToHex(namehash("eth"))).toBe(
        "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae",
      );
    });

    it("computes correct namehash for vitalik.eth", () => {
      // Known value
      expect(bytesToHex(namehash("vitalik.eth"))).toBe(
        "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835",
      );
    });
  });

  describe("dnsEncode", () => {
    it("encodes vitalik.eth correctly", () => {
      const result = dnsEncode("vitalik.eth");
      // [7, v, i, t, a, l, i, k, 3, e, t, h, 0]
      expect(result[0]).toBe(7); // length of "vitalik"
      expect(result[8]).toBe(3); // length of "eth"
      expect(result[result.length - 1]).toBe(0); // terminator
      expect(result.length).toBe(13);
    });

    it("encodes single label", () => {
      const result = dnsEncode("eth");
      expect(result[0]).toBe(3);
      expect(result[result.length - 1]).toBe(0);
      expect(result.length).toBe(5);
    });
  });

  describe("isENSName", () => {
    it("returns true for .eth names", () => {
      expect(isENSName("vitalik.eth")).toBe(true);
      expect(isENSName("test.eth")).toBe(true);
      expect(isENSName("sub.domain.eth")).toBe(true);
    });

    it("returns false for hex addresses", () => {
      expect(isENSName("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
    });

    it("returns false for bare .eth", () => {
      expect(isENSName(".eth")).toBe(false);
    });

    it("returns false for non-.eth strings", () => {
      expect(isENSName("vitalik.com")).toBe(false);
      expect(isENSName("hello")).toBe(false);
    });
  });
});
