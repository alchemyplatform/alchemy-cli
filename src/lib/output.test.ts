import { describe, it, expect, afterEach } from "vitest";
import { isJSONMode, setFlags } from "./output.js";

describe("isJSONMode", () => {
  afterEach(() => {
    setFlags({});
  });

  it("returns true when forceJSON is set", () => {
    setFlags({ json: true });
    expect(isJSONMode()).toBe(true);
  });

  it("returns true when stdout is not a TTY (test environment)", () => {
    setFlags({});
    // In tests, stdout is not a terminal
    expect(isJSONMode()).toBe(true);
  });
});
