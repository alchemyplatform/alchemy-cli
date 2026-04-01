import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("../src/lib/config.js", () => ({
  configPath: () => "/fake/.config/alchemy/config.json",
}));

// Must be after mocks so the module picks them up.
const { getAvailableUpdate, getUpdateStatus, printUpdateNotice } = await import(
  "../../src/lib/update-check.js"
);

describe("getAvailableUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latest version when npm reports a newer version (no cache)", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    vi.mocked(execFileSync).mockReturnValue("1.0.0\n");

    // __CLI_VERSION__ is "0.2.0" from tsup define
    const result = getAvailableUpdate();
    expect(result).toBe("1.0.0");
    expect(writeFileSync).toHaveBeenCalledOnce();
  });

  it("returns null when current version matches latest", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    // Return the same version as __CLI_VERSION__
    vi.mocked(execFileSync).mockReturnValue("0.0.0\n");

    const result = getAvailableUpdate();
    expect(result).toBeNull();
  });

  it("returns null when npm check fails", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("network error");
    });

    const result = getAvailableUpdate();
    expect(result).toBeNull();
  });

  it("uses cached value when cache is fresh", () => {
    const cache = { latest: "9.9.9", checkedAt: Date.now() };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(cache));

    const result = getAvailableUpdate();
    expect(result).toBe("9.9.9");
    // Should not call npm
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("re-checks npm when cache is stale", () => {
    const staleCache = {
      latest: "0.1.0",
      checkedAt: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleCache));
    vi.mocked(execFileSync).mockReturnValue("2.0.0\n");

    const result = getAvailableUpdate();
    expect(result).toBe("2.0.0");
    expect(execFileSync).toHaveBeenCalledOnce();
  });

  it("returns null when cached version is not newer", () => {
    // __CLI_VERSION__ defaults to "0.0.0" in test env (no tsup injection)
    const cache = { latest: "0.0.0", checkedAt: Date.now() };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(cache));

    const result = getAvailableUpdate();
    expect(result).toBeNull();
  });
});

describe("getUpdateStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured status from a fresh cache", () => {
    const checkedAt = Date.now();
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ latest: "9.9.9", checkedAt }),
    );

    const result = getUpdateStatus();

    expect(result).toEqual({
      currentVersion: "0.0.0",
      latestVersion: "9.9.9",
      updateAvailable: true,
      installCommand: "npm i -g @alchemy/cli@latest",
      checkedAt,
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the cached version when refresh fails", () => {
    const checkedAt = Date.now() - 25 * 60 * 60 * 1000;
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ latest: "9.9.9", checkedAt }),
    );
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("network error");
    });

    const result = getUpdateStatus();

    expect(result).toEqual({
      currentVersion: "0.0.0",
      latestVersion: "9.9.9",
      updateAvailable: true,
      installCommand: "npm i -g @alchemy/cli@latest",
      checkedAt,
    });
  });

  it("returns unknown latest version when no cache or refresh is available", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("network error");
    });

    const result = getUpdateStatus();

    expect(result).toEqual({
      currentVersion: "0.0.0",
      latestVersion: null,
      updateAvailable: false,
      installCommand: "npm i -g @alchemy/cli@latest",
      checkedAt: null,
    });
  });
});

describe("printUpdateNotice", () => {
  it("writes update notice to stderr", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    printUpdateNotice("1.0.0");

    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain("Update available");
    expect(output).toContain("1.0.0");
    expect(output).toContain("npm i -g @alchemy/cli@latest");

    writeSpy.mockRestore();
  });
});
