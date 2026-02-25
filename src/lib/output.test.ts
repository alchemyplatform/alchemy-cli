import { describe, it, expect, afterEach, vi } from "vitest";
import { isJSONMode, setFlags, debug, verbose, debugMode } from "./output.js";

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

describe("output flags", () => {
  afterEach(() => {
    setFlags({});
  });

  it("tracks verbose and debug independently", () => {
    setFlags({ verbose: true, debug: false });
    expect(verbose).toBe(true);
    expect(debugMode).toBe(false);

    setFlags({ verbose: false, debug: true });
    expect(verbose).toBe(false);
    expect(debugMode).toBe(true);
  });

  it("only prints debug logs when debug mode is enabled", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setFlags({ debug: false });
    debug("quiet");
    expect(errSpy).not.toHaveBeenCalled();

    setFlags({ debug: true });
    debug("loud");
    expect(errSpy).toHaveBeenCalledWith("[debug] loud");

    errSpy.mockRestore();
  });
});
