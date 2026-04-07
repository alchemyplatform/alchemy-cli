import { describe, it, expect } from "vitest";
import { parseAmount } from "../../src/commands/send.js";

describe("parseAmount", () => {
  it("parses whole number with 18 decimals", () => {
    expect(parseAmount("1", 18)).toBe(1000000000000000000n);
  });

  it("parses decimal amount with 18 decimals", () => {
    expect(parseAmount("1.5", 18)).toBe(1500000000000000000n);
  });

  it("parses small fraction with 18 decimals", () => {
    expect(parseAmount("0.001", 18)).toBe(1000000000000000n);
  });

  it("parses whole number with 6 decimals (USDC)", () => {
    expect(parseAmount("100", 6)).toBe(100000000n);
  });

  it("parses decimal with 6 decimals", () => {
    expect(parseAmount("1.5", 6)).toBe(1500000n);
  });

  it("parses amount with trailing zeros", () => {
    expect(parseAmount("1.50", 18)).toBe(1500000000000000000n);
  });

  it("parses amount with leading decimal", () => {
    expect(parseAmount(".5", 18)).toBe(500000000000000000n);
  });

  it("rejects negative amounts", () => {
    expect(() => parseAmount("-1", 18)).toThrow(/positive number/);
  });

  it("rejects zero amount", () => {
    expect(() => parseAmount("0", 18)).toThrow(/greater than zero/);
  });

  it("rejects empty string", () => {
    expect(() => parseAmount("", 18)).toThrow(/required/);
  });

  it("rejects too many decimal places", () => {
    expect(() => parseAmount("1.1234567", 6)).toThrow(/Too many decimal places/);
  });

  it("rejects non-numeric input", () => {
    expect(() => parseAmount("abc", 18)).toThrow(/Invalid amount/);
  });

  it("rejects multiple dots", () => {
    expect(() => parseAmount("1.2.3", 18)).toThrow(/Invalid amount/);
  });

  it("handles large amounts", () => {
    expect(parseAmount("1000000", 18)).toBe(1000000000000000000000000n);
  });

  it("handles max decimal places exactly", () => {
    expect(parseAmount("1.123456", 6)).toBe(1123456n);
  });
});
