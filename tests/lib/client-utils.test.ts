import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isLocalhost, parseBaseURLOverride } from "../../src/lib/client-utils.js";

describe("isLocalhost", () => {
  it("returns true for localhost", () => {
    expect(isLocalhost("localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLocalhost("127.0.0.1")).toBe(true);
  });

  it("returns true for ::1", () => {
    expect(isLocalhost("::1")).toBe(true);
  });

  it("returns false for external host", () => {
    expect(isLocalhost("example.com")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalhost("")).toBe(false);
  });
});

describe("parseBaseURLOverride", () => {
  const ENV_VAR = "TEST_BASE_URL";
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = original;
    }
  });

  it("returns null when env var is not set", () => {
    delete process.env[ENV_VAR];
    expect(parseBaseURLOverride(ENV_VAR)).toBeNull();
  });

  it("returns URL for valid localhost http", () => {
    process.env[ENV_VAR] = "http://localhost:8080";
    const result = parseBaseURLOverride(ENV_VAR);
    expect(result).not.toBeNull();
    expect(result!.hostname).toBe("localhost");
  });

  it("throws for non-localhost host", () => {
    process.env[ENV_VAR] = "https://example.com";
    expect(() => parseBaseURLOverride(ENV_VAR)).toThrow(/must target localhost/);
  });

  it("throws for invalid URL", () => {
    process.env[ENV_VAR] = "not-a-url";
    expect(() => parseBaseURLOverride(ENV_VAR)).toThrow(/Invalid/);
  });

  it("throws for non-http/https protocol", () => {
    process.env[ENV_VAR] = "ftp://localhost:8080";
    expect(() => parseBaseURLOverride(ENV_VAR)).toThrow(/must use http/);
  });
});
