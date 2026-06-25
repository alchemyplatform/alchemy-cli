import { describe, it, expect } from "vitest";
import { parseHeadlessCallback, AUTH_PORT } from "../../src/lib/auth.js";

describe("parseHeadlessCallback", () => {
  it("parses a full redirected callback URL", () => {
    const result = parseHeadlessCallback(
      `http://localhost:${AUTH_PORT}/callback?code=abc123&state=xyz789`,
    );
    expect(result).toEqual({ code: "abc123", state: "xyz789" });
  });

  it("parses a bare callback path by assuming the localhost callback origin", () => {
    const result = parseHeadlessCallback("/callback?code=def456&state=qqq");
    expect(result).toEqual({ code: "def456", state: "qqq" });
  });

  it("treats a bare string as a raw authorization code with null state", () => {
    expect(parseHeadlessCallback("rawcode789")).toEqual({
      code: "rawcode789",
      state: null,
    });
  });

  it("trims surrounding whitespace from a raw code", () => {
    expect(parseHeadlessCallback("  rawcode789  ")).toEqual({
      code: "rawcode789",
      state: null,
    });
  });

  it("extracts state when present in the URL", () => {
    expect(
      parseHeadlessCallback(
        `http://localhost:${AUTH_PORT}/callback?code=a&state=the-state`,
      ).state,
    ).toBe("the-state");
  });

  it("returns null state when the URL omits state", () => {
    expect(
      parseHeadlessCallback(`http://localhost:${AUTH_PORT}/callback?code=a`).state,
    ).toBeNull();
  });

  it("throws when the URL has no authorization code", () => {
    expect(() =>
      parseHeadlessCallback(`http://localhost:${AUTH_PORT}/callback?state=s`),
    ).toThrow(/code/i);
  });

  it("throws on empty input", () => {
    expect(() => parseHeadlessCallback("   ")).toThrow(/no input/i);
  });

  it("surfaces an OAuth error carried in the callback URL", () => {
    expect(() =>
      parseHeadlessCallback(
        `http://localhost:${AUTH_PORT}/callback?error=access_denied&error_description=Denied%20by%20user`,
      ),
    ).toThrow(/Denied by user/);
  });
});
