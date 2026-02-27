import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isJSONMode,
  setFlags,
  debug,
  verbose,
  debugMode,
  printError,
} from "../../src/lib/output.js";
import { CLIError, ErrorCode } from "../../src/lib/errors.js";

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

describe("printError", () => {
  afterEach(() => {
    setFlags({});
  });

  it("redacts provider details in json mode for auth errors", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setFlags({ json: true });

    const err = new CLIError(
      ErrorCode.INVALID_API_KEY,
      "Invalid API key. Check your key and try again.",
      "alchemy config set api-key <your-key>",
      "Unauthorized request to https://eth-mainnet.g.alchemy.com/v2/abcd1234secret",
    );

    printError(err);

    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(errSpy.mock.calls[0][0])) as {
      error: { code: string; details?: string };
    };
    expect(payload.error.code).toBe(ErrorCode.INVALID_API_KEY);
    expect(payload.error.details).toBeUndefined();

    errSpy.mockRestore();
  });

  it("redacts key-like path segments for non-auth json errors", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setFlags({ json: true });

    const err = new CLIError(
      ErrorCode.NETWORK_ERROR,
      "Network error: upstream failed",
      undefined,
      "Try https://eth-mainnet.g.alchemy.com/v2/abcd1234secret?x=1",
    );

    printError(err);

    expect(errSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(errSpy.mock.calls[0][0])) as {
      error: { details?: string };
    };
    expect(payload.error.details).toBe(
      "Try https://eth-mainnet.g.alchemy.com/v2/[REDACTED]?x=1",
    );

    errSpy.mockRestore();
  });
});
