import { describe, expect, it } from "vitest";
import {
  formatHexQuantity,
  formatBlockTimestamp,
  formatGasSummary,
} from "../lib/block-format.js";

describe("block formatting helpers", () => {
  it("formats hex quantities with separators", () => {
    expect(formatHexQuantity("0x10")).toBe("16");
    expect(formatHexQuantity("0x2540be400")).toBe("10,000,000,000");
  });

  it("returns undefined for invalid quantities", () => {
    expect(formatHexQuantity("latest")).toBeUndefined();
    expect(formatHexQuantity(undefined)).toBeUndefined();
  });

  it("formats timestamps into ISO + relative text", () => {
    const out = formatBlockTimestamp("0x0");
    expect(out).toBeDefined();
    expect(out?.startsWith("1970-01-01T00:00:00Z")).toBe(true);
    expect(out).toContain("(");
  });

  it("formats gas usage with percentage", () => {
    expect(formatGasSummary("0x5f5e100", "0x7735940")).toBe(
      "100,000,000 / 125,000,000 (80.00%)",
    );
  });
});
