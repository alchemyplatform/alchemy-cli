import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import * as config from "./config.js";

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

  it("returns false for unknown key", () => {
    const { ok } = config.set({}, "unknown", "value");
    expect(ok).toBe(false);
  });

  it("returns undefined for unknown key get", () => {
    expect(config.get({}, "unknown")).toBeUndefined();
  });
});

describe("config toMap", () => {
  it("returns populated map", () => {
    const m = config.toMap({
      api_key: "key1",
      access_key: "ak",
      app: { id: "app-1", name: "My App", apiKey: "ak-123" },
      network: "eth-mainnet",
    });
    expect(m).toEqual({
      "api-key": "key1",
      "access-key": "ak",
      app: "My App (app-1)",
      network: "eth-mainnet",
    });
  });

  it("returns empty map for empty config", () => {
    expect(config.toMap({})).toEqual({});
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
    const cfg: config.Config = { api_key: "testkey", network: "eth-sepolia" };
    config.save(cfg);

    const loaded = config.load();
    expect(loaded.api_key).toBe("testkey");
    expect(loaded.network).toBe("eth-sepolia");
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
});
