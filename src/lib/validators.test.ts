import { describe, it, expect } from "vitest";
import { validateAddress, validateTxHash } from "./validators.js";

describe("validateAddress", () => {
  it("accepts a valid address", () => {
    expect(() =>
      validateAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).not.toThrow();
  });

  it("accepts a lowercase address", () => {
    expect(() =>
      validateAddress("0x0000000000000000000000000000000000000000"),
    ).not.toThrow();
  });

  it("rejects address without 0x prefix", () => {
    expect(() =>
      validateAddress("d8dA6BF26964aF9D7eEd9e03E53415D37aA96045"),
    ).toThrow("Invalid address");
  });

  it("rejects address that is too short", () => {
    expect(() => validateAddress("0xd8dA6BF269")).toThrow("Invalid address");
  });

  it("rejects address that is too long", () => {
    expect(() =>
      validateAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045ff"),
    ).toThrow("Invalid address");
  });

  it("rejects address with non-hex characters", () => {
    expect(() =>
      validateAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"),
    ).toThrow("Invalid address");
  });
});

describe("validateTxHash", () => {
  it("accepts a valid transaction hash", () => {
    expect(() =>
      validateTxHash(
        "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      ),
    ).not.toThrow();
  });

  it("rejects hash without 0x prefix", () => {
    expect(() =>
      validateTxHash(
        "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      ),
    ).toThrow("Invalid transaction hash");
  });

  it("rejects hash that is too short", () => {
    expect(() => validateTxHash("0xabc123")).toThrow("Invalid transaction hash");
  });

  it("rejects hash that is too long", () => {
    expect(() =>
      validateTxHash(
        "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1ff",
      ),
    ).toThrow("Invalid transaction hash");
  });

  it("rejects hash with non-hex characters", () => {
    expect(() =>
      validateTxHash(
        "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ",
      ),
    ).toThrow("Invalid transaction hash");
  });
});
