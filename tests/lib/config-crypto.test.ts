import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "../../src/lib/config-crypto.js";

describe("config-crypto", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const original = JSON.stringify({ api_key: "test-key", network: "eth-mainnet" });
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for the same plaintext", () => {
    const text = "same input";
    const a = encrypt(text);
    const b = encrypt(text);
    expect(a.equals(b)).toBe(false);
  });

  it("isEncrypted returns true for encrypted data", () => {
    const encrypted = encrypt("test");
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("isEncrypted returns false for plaintext JSON", () => {
    const json = Buffer.from('{"api_key":"x"}', "utf-8");
    expect(isEncrypted(json)).toBe(false);
  });

  it("isEncrypted returns false for empty buffer", () => {
    expect(isEncrypted(Buffer.alloc(0))).toBe(false);
  });

  it("decrypt throws on truncated data", () => {
    const encrypted = encrypt("test");
    const truncated = encrypted.subarray(0, 20);
    expect(() => decrypt(truncated)).toThrow();
  });

  it("decrypt throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    // Flip a byte in the ciphertext portion (after the 53-byte header)
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => decrypt(encrypted)).toThrow();
  });

  it("decrypt throws on wrong magic bytes", () => {
    const bad = Buffer.from("NOT_ENCRsome-data-here-padding-to-be-long-enough-for-header");
    expect(() => decrypt(bad)).toThrow("Invalid encrypted config magic bytes");
  });
});
