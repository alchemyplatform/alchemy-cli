import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as config from "../../src/lib/config.js";

describe("config set/get", () => {
  it("sets and gets api-key", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "api-key", "test123");
    expect(ok).toBe(true);
    expect(config.get(updated, "api-key")).toBe("test123");
    expect(config.get(updated, "api_key")).toBe("test123");
  });

  it("sets and gets access-key", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "access-key", "ak_test");
    expect(ok).toBe(true);
    expect(config.get(updated, "access-key")).toBe("ak_test");
    expect(config.get(updated, "access_key")).toBe("ak_test");
  });

  it("rejects app as a set key", () => {
    const { ok } = config.set({}, "app", "app-123");
    expect(ok).toBe(false);
  });

  it("sets and gets network", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "network", "polygon-mainnet");
    expect(ok).toBe(true);
    expect(config.get(updated, "network")).toBe("polygon-mainnet");
  });

  it("sets and gets verbose", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "verbose", "true");
    expect(ok).toBe(true);
    expect(updated.verbose).toBe(true);
    expect(config.get(updated, "verbose")).toBe("true");
  });

  it("rejects invalid verbose values", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "verbose", "yes");
    expect(ok).toBe(false);
    expect(updated.verbose).toBeUndefined();
  });

  it("returns false for unknown key", () => {
    const { ok } = config.set({}, "unknown", "value");
    expect(ok).toBe(false);
  });

  it("returns undefined for unknown key get", () => {
    expect(config.get({}, "unknown")).toBeUndefined();
  });
});

describe("config toMap", () => {
  it("returns populated map with masked secrets", () => {
    const m = config.toMap({
      api_key: "test-api-key-1234",
      access_key: "ak",
      app: { id: "app-1", name: "My App", apiKey: "ak-123" },
      network: "eth-mainnet",
      verbose: true,
    });
    // api_key is > 8 chars so first 4 + bullets + last 4
    expect(m["api-key"]).toMatch(/^test.*1234$/);
    expect(m["api-key"]).toContain("\u2022");
    // access_key is ≤ 8 chars so fully masked
    expect(m["access-key"]).toBe("\u2022\u2022");
    expect(m).toMatchObject({
      app: "My App (app-1)",
      network: "eth-mainnet",
      verbose: "true",
    });
  });

  it("returns empty map for empty config", () => {
    expect(config.toMap({})).toEqual({});
  });
});

describe("configPath", () => {
  let origAlchemyConfig: string | undefined;

  beforeEach(() => {
    origAlchemyConfig = process.env.ALCHEMY_CONFIG;
  });

  afterEach(() => {
    if (origAlchemyConfig === undefined) {
      delete process.env.ALCHEMY_CONFIG;
    } else {
      process.env.ALCHEMY_CONFIG = origAlchemyConfig;
    }
  });

  it("uses ALCHEMY_CONFIG env var when set", () => {
    process.env.ALCHEMY_CONFIG = "/tmp/custom-config.json";
    expect(config.configPath()).toBe("/tmp/custom-config.json");
  });

  it("falls back to default path when ALCHEMY_CONFIG is not set", () => {
    delete process.env.ALCHEMY_CONFIG;
    expect(config.configPath()).toContain(".config/alchemy/config.json");
  });
});

describe("config save/load", () => {
  let origHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    origHome = process.env.HOME;
    tmpDir = join(tmpdir(), `alchemy-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
  });

  it("saves and loads config", () => {
    const cfg: config.Config = {
      api_key: "testkey",
      network: "eth-sepolia",
      verbose: true,
    };
    config.save(cfg);

    const loaded = config.load();
    expect(loaded.api_key).toBe("testkey");
    expect(loaded.network).toBe("eth-sepolia");
    expect(loaded.verbose).toBe(true);
  });

  it("saves with 0600 permissions", () => {
    config.save({ api_key: "secret" });
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    const stats = statSync(p);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("saves valid JSON", () => {
    config.save({ api_key: "key" });
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    const data = readFileSync(p, "utf-8");
    expect(() => JSON.parse(data)).not.toThrow();
  });

  it("returns empty config for missing file", () => {
    const loaded = config.load();
    expect(loaded).toEqual({});
  });

  it("sanitizes invalid persisted fields", () => {
    const unsafe: config.Config = {
      api_key: "ok-api-key",
      access_key: "ok-access-key",
      network: "../etc/passwd",
      verbose: true,
      app: {
        id: "app-123",
        name: "My App",
        apiKey: "app-api-key\nwith-newline",
      },
    };
    config.save(unsafe);

    const loaded = config.load();
    expect(loaded).toEqual({
      api_key: "ok-api-key",
      access_key: "ok-access-key",
      verbose: true,
    });
  });

  it("persists app when fields are valid", () => {
    config.save({
      app: { id: "app-1", name: "My App", apiKey: "app-key-123" },
    });

    const loaded = config.load();
    expect(loaded.app).toEqual({
      id: "app-1",
      name: "My App",
      apiKey: "app-key-123",
    });
  });
});
