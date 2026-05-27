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

  it("rejects app as a set key", () => {
    const { ok } = config.set({}, "app", "app-123");
    expect(ok).toBe(false);
  });

  it("gets app display value when selected app exists", () => {
    const cfg: config.Config = {
      app: { id: "app-123", name: "Demo App", apiKey: "demo-key" },
    };
    expect(config.get(cfg, "app")).toBe("Demo App (app-123)");
  });

  it("rejects network as an implicit config key", () => {
    const { ok, config: updated } = config.set({}, "network", "polygon-mainnet");
    expect(ok).toBe(false);
    expect(config.get(updated, "network")).toBeUndefined();
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

  it("sets and gets EVM gas policy config", () => {
    const cfg: config.Config = {};
    const sponsoredResult = config.set(cfg, "evm-gas-sponsored", "true");
    expect(sponsoredResult.ok).toBe(true);
    expect(sponsoredResult.config.evm_gas_sponsored).toBe(true);
    expect(config.get(sponsoredResult.config, "evm-gas-sponsored")).toBe("true");

    const policyResult = config.set(sponsoredResult.config, "evm-gas-policy-id", "evm-policy");
    expect(policyResult.ok).toBe(true);
    expect(config.get(policyResult.config, "evm-gas-policy-id")).toBe("evm-policy");
    expect(config.get(policyResult.config, "evm_gas_policy_id")).toBe("evm-policy");
  });

  it("sets and gets Solana fee policy config", () => {
    const cfg: config.Config = {};
    const sponsoredResult = config.set(cfg, "solana-fee-sponsored", "true");
    expect(sponsoredResult.ok).toBe(true);
    expect(sponsoredResult.config.solana_fee_sponsored).toBe(true);
    expect(config.get(sponsoredResult.config, "solana-fee-sponsored")).toBe("true");

    const policyResult = config.set(sponsoredResult.config, "solana-fee-policy-id", "solana-policy");
    expect(policyResult.ok).toBe(true);
    expect(config.get(policyResult.config, "solana-fee-policy-id")).toBe("solana-policy");
    expect(config.get(policyResult.config, "solana_fee_policy_id")).toBe("solana-policy");
  });

  it("sets and gets delegated-wallet", () => {
    const cfg: config.Config = {};
    const { ok, config: updated } = config.set(cfg, "delegated-wallet", "true");
    expect(ok).toBe(true);
    expect(updated.delegated_wallet).toBe(true);
    expect(config.get(updated, "delegated-wallet")).toBe("true");
    expect(config.get(updated, "delegated_wallet")).toBe("true");
  });
});

describe("config toMap", () => {
  it("returns populated map with masked secrets", () => {
    const m = config.toMap({
      api_key: "test-api-key-1234",
      app: { id: "app-1", name: "My App", apiKey: "ak-123" },
      verbose: true,
    });
    // api_key is > 8 chars so first 4 + bullets + last 4
    expect(m["api-key"]).toMatch(/^test.*1234$/);
    expect(m["api-key"]).toContain("\u2022");
    expect(m).toMatchObject({
      app: "My App (app-1)",
      verbose: "true",
    });
    expect(m["network"]).toBeUndefined();
  });

  it("does not expose legacy delegated-wallet in toMap output", () => {
    const m = config.toMap({
      delegated_wallet: true,
    });
    expect(m["delegated-wallet"]).toBeUndefined();
  });

  it("includes active-signer when configured", () => {
    const m = config.toMap({ active_signer: "session" });
    expect(m["active-signer"]).toBe("session");
  });

  it("includes chain-specific sponsorship policy config", () => {
    const m = config.toMap({
      evm_gas_sponsored: true,
      evm_gas_policy_id: "evm-policy",
      solana_fee_sponsored: true,
      solana_fee_policy_id: "solana-policy",
    });

    expect(m).toMatchObject({
      "evm-gas-sponsored": "true",
      "evm-gas-policy-id": "evm-policy",
      "solana-fee-sponsored": "true",
      "solana-fee-policy-id": "solana-policy",
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
  let origXdg: string | undefined;
  let origAlchemyCfg: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    origHome = process.env.HOME;
    origXdg = process.env.XDG_CONFIG_HOME;
    origAlchemyCfg = process.env.ALCHEMY_CONFIG;
    tmpDir = join(tmpdir(), `alchemy-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    process.env.HOME = tmpDir;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.ALCHEMY_CONFIG;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (origXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = origXdg;
    if (origAlchemyCfg === undefined) delete process.env.ALCHEMY_CONFIG;
    else process.env.ALCHEMY_CONFIG = origAlchemyCfg;
  });

  it("saves and loads config", () => {
    const cfg: config.Config = {
      api_key: "testkey",
      verbose: true,
    };
    config.save(cfg);

    const loaded = config.load();
    expect(loaded.api_key).toBe("testkey");
    expect(loaded.verbose).toBe(true);
  });

  it("strips legacy network config on save", () => {
    config.save({ api_key: "testkey", network: "eth-sepolia" } as unknown as config.Config);

    const loaded = config.load();
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    const onDisk = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;

    expect((loaded as Record<string, unknown>).network).toBeUndefined();
    expect(onDisk.network).toBeUndefined();
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

  it("creates and reuses a stable wallet client instance id", () => {
    const firstId = config.getOrCreateWalletClientInstanceId();
    const secondId = config.getOrCreateWalletClientInstanceId();
    const loaded = config.load();

    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(secondId).toBe(firstId);
    expect(loaded.wallet_client_instance_id).toBe(firstId);
  });

  it("derives a stable wallet client instance id from the instance name", () => {
    const first = config.getOrCreateWalletClientInstance({
      instanceName: "Chris Laptop",
    });
    const second = config.getOrCreateWalletClientInstance();
    const loaded = config.load();

    expect(first).toStrictEqual({
      id: config.deriveWalletClientInstanceIdFromName("chris laptop"),
      name: "Chris Laptop",
    });
    expect(second).toStrictEqual(first);
    expect(loaded.wallet_client_instance_id).toBe(first.id);
    expect(loaded.wallet_client_instance_name).toBe("Chris Laptop");
  });

  it("rejects invalid wallet client instance names", () => {
    expect(
      config.normalizeWalletClientInstanceName(" ".repeat(65)),
    ).toBeUndefined();
    expect(() =>
      config.getOrCreateWalletClientInstance({ instanceName: "\n" }),
    ).toThrow("Invalid wallet client instance name.");
  });

  it("returns empty config for missing file", () => {
    const loaded = config.load();
    expect(loaded).toEqual({});
  });

  it("sanitizes invalid persisted fields", () => {
    const unsafe = {
      api_key: "ok-api-key",
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

  it("load() migrates legacy delegated_wallet:true to active_signer=session", () => {
    // Hand-write the legacy shape to disk and confirm load() normalizes it.
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    mkdirSync(join(tmpDir, ".config", "alchemy"), { recursive: true });
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(p, JSON.stringify({ api_key: "k", delegated_wallet: true }), { mode: 0o600 });

    const loaded = config.load();
    expect(loaded.active_signer).toBe("session");
    expect(loaded.delegated_wallet).toBeUndefined();
  });

  it("load() prefers active_signer when both are present on disk", () => {
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    mkdirSync(join(tmpDir, ".config", "alchemy"), { recursive: true });
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(
      p,
      JSON.stringify({ api_key: "k", delegated_wallet: true, active_signer: "local" }),
      { mode: 0o600 },
    );

    const loaded = config.load();
    expect(loaded.active_signer).toBe("local");
  });

  it("save() unconditionally strips delegated_wallet from persisted JSON", () => {
    config.save({ api_key: "k", delegated_wallet: true } as config.Config);
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    const onDisk = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    expect(onDisk.delegated_wallet).toBeUndefined();
  });

  it("migration round-trip: legacy on disk → save persists active_signer and removes legacy", () => {
    const p = join(tmpDir, ".config", "alchemy", "config.json");
    mkdirSync(join(tmpDir, ".config", "alchemy"), { recursive: true });
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(p, JSON.stringify({ api_key: "k", delegated_wallet: true }), { mode: 0o600 });

    // Simulate any user action that triggers load+save (e.g. `config set verbose`).
    const loaded = config.load();
    config.save({ ...loaded, verbose: true });

    const onDisk = JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>;
    expect(onDisk.active_signer).toBe("session");
    expect(onDisk.delegated_wallet).toBeUndefined();
    expect(onDisk.verbose).toBe(true);
  });
});
