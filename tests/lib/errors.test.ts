import { describe, it, expect } from "vitest";
import {
  CLIError,
  ErrorCode,
  EXIT_CODES,
  errAuthRequired,
  errAccessKeyRequired,
  errInvalidAPIKey,
  errNetworkNotEnabled,
  errInvalidAccessKey,
  errAppRequired,
  errAdminAPI,
  errNetwork,
  errRPC,
  errInvalidArgs,
  errNotFound,
  errRateLimited,
} from "../../src/lib/errors.js";

describe("CLIError", () => {
  it("formats with hint", () => {
    const err = new CLIError(
      ErrorCode.AUTH_REQUIRED,
      "not authenticated",
      "run config set",
    );
    expect(err.format()).toContain("AUTH_REQUIRED");
    expect(err.format()).toContain("not authenticated");
    expect(err.format()).toContain("run config set");
  });

  it("formats without hint", () => {
    const err = new CLIError(ErrorCode.RPC_ERROR, "something failed");
    expect(err.format()).not.toContain("Hint");
  });

  it("produces correct JSON structure", () => {
    const err = new CLIError(ErrorCode.INVALID_API_KEY, "bad key", "check your key");
    const json = err.toJSON();
    expect(json.error.code).toBe("INVALID_API_KEY");
    expect(json.error.message).toBe("bad key");
    expect(json.error.hint).toBe("check your key");
  });

  it("omits hint from JSON when not set", () => {
    const err = new CLIError(ErrorCode.RPC_ERROR, "failed");
    const json = err.toJSON();
    expect(json.error).not.toHaveProperty("hint");
  });

  it("includes details in JSON when set", () => {
    const err = new CLIError(
      ErrorCode.INVALID_API_KEY,
      "bad key",
      "check your key",
      "upstream auth failed",
    );
    const json = err.toJSON();
    expect(json.error.details).toBe("upstream auth failed");
  });

  it("marks RATE_LIMITED as retryable", () => {
    const err = errRateLimited();
    expect(err.toJSON().error.retryable).toBe(true);
  });

  it("marks NETWORK_ERROR as retryable", () => {
    const err = errNetwork("timeout");
    expect(err.toJSON().error.retryable).toBe(true);
  });

  it("marks other errors as not retryable", () => {
    const cases = [
      errAuthRequired(),
      errInvalidAPIKey(),
      errNetworkNotEnabled("ROOTSTOCK_MAINNET"),
      errInvalidArgs("bad"),
      errNotFound("tx"),
      errRPC(-32600, "invalid"),
      errAdminAPI(500, "fail"),
    ];
    for (const err of cases) {
      expect(err.toJSON().error.retryable).toBe(false);
    }
  });
});

describe("convenience constructors", () => {
  const cases = [
    {
      name: "errAuthRequired",
      fn: errAuthRequired,
      code: ErrorCode.AUTH_REQUIRED,
    },
    {
      name: "errInvalidAPIKey",
      fn: errInvalidAPIKey,
      code: ErrorCode.INVALID_API_KEY,
    },
    {
      name: "errInvalidAPIKey with details",
      fn: () => errInvalidAPIKey("upstream auth failed"),
      code: ErrorCode.INVALID_API_KEY,
    },
    {
      name: "errNetworkNotEnabled",
      fn: () => errNetworkNotEnabled("ROOTSTOCK_MAINNET"),
      code: ErrorCode.NETWORK_NOT_ENABLED,
    },
    {
      name: "errNetwork",
      fn: () => errNetwork("timeout"),
      code: ErrorCode.NETWORK_ERROR,
    },
    {
      name: "errRPC",
      fn: () => errRPC(-32600, "invalid"),
      code: ErrorCode.RPC_ERROR,
    },
    {
      name: "errInvalidArgs",
      fn: () => errInvalidArgs("bad"),
      code: ErrorCode.INVALID_ARGS,
    },
    {
      name: "errNotFound",
      fn: () => errNotFound("tx"),
      code: ErrorCode.NOT_FOUND,
    },
    { name: "errRateLimited", fn: errRateLimited, code: ErrorCode.RATE_LIMITED },
    {
      name: "errAccessKeyRequired",
      fn: errAccessKeyRequired,
      code: ErrorCode.ACCESS_KEY_REQUIRED,
    },
    {
      name: "errInvalidAccessKey",
      fn: errInvalidAccessKey,
      code: ErrorCode.INVALID_ACCESS_KEY,
    },
    { name: "errAppRequired", fn: errAppRequired, code: ErrorCode.APP_REQUIRED },
    {
      name: "errAdminAPI",
      fn: () => errAdminAPI(500, "fail"),
      code: ErrorCode.ADMIN_API_ERROR,
    },
  ];

  for (const { name, fn, code } of cases) {
    it(`${name} has code ${code}`, () => {
      expect(fn().code).toBe(code);
    });
  }
});

describe("errRPC hints", () => {
  it("includes hint for known RPC error codes", () => {
    const err = errRPC(-32601, "Method not found");
    expect(err.hint).toBeDefined();
    expect(err.hint).toContain("Method not supported");
  });

  it("includes hint for invalid params", () => {
    const err = errRPC(-32602, "Invalid params");
    expect(err.hint).toContain("Invalid parameters");
  });

  it("has no hint for unknown RPC error codes", () => {
    const err = errRPC(-32000, "Execution reverted");
    expect(err.hint).toBeUndefined();
  });
});

describe("EXIT_CODES", () => {
  it("has a mapping for every ErrorCode", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(EXIT_CODES).toHaveProperty(code);
      expect(typeof EXIT_CODES[code]).toBe("number");
    }
  });
});
