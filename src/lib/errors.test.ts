import { describe, it, expect } from "vitest";
import {
  CLIError,
  ErrorCode,
  EXIT_CODES,
  errAuthRequired,
  errAccessKeyRequired,
  errInvalidAPIKey,
  errInvalidAccessKey,
  errAppRequired,
  errAdminAPI,
  errNetwork,
  errRPC,
  errInvalidArgs,
  errNotFound,
  errRateLimited,
} from "./errors.js";

describe("CLIError", () => {
  it("formats with hint", () => {
    const err = new CLIError(ErrorCode.AUTH_REQUIRED, "not authenticated", "run config set");
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
});

describe("convenience constructors", () => {
  const cases = [
    { name: "errAuthRequired", fn: errAuthRequired, code: ErrorCode.AUTH_REQUIRED },
    { name: "errInvalidAPIKey", fn: errInvalidAPIKey, code: ErrorCode.INVALID_API_KEY },
    { name: "errNetwork", fn: () => errNetwork("timeout"), code: ErrorCode.NETWORK_ERROR },
    { name: "errRPC", fn: () => errRPC(-32600, "invalid"), code: ErrorCode.RPC_ERROR },
    { name: "errInvalidArgs", fn: () => errInvalidArgs("bad"), code: ErrorCode.INVALID_ARGS },
    { name: "errNotFound", fn: () => errNotFound("tx"), code: ErrorCode.NOT_FOUND },
    { name: "errRateLimited", fn: errRateLimited, code: ErrorCode.RATE_LIMITED },
    { name: "errAccessKeyRequired", fn: errAccessKeyRequired, code: ErrorCode.ACCESS_KEY_REQUIRED },
    { name: "errInvalidAccessKey", fn: errInvalidAccessKey, code: ErrorCode.INVALID_ACCESS_KEY },
    { name: "errAppRequired", fn: errAppRequired, code: ErrorCode.APP_REQUIRED },
    { name: "errAdminAPI", fn: () => errAdminAPI(500, "fail"), code: ErrorCode.ADMIN_API_ERROR },
  ];

  for (const { name, fn, code } of cases) {
    it(`${name} has code ${code}`, () => {
      expect(fn().code).toBe(code);
    });
  }
});

describe("EXIT_CODES", () => {
  it("has a mapping for every ErrorCode", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(EXIT_CODES).toHaveProperty(code);
      expect(typeof EXIT_CODES[code]).toBe("number");
    }
  });
});
