import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

describe("wallet-session", () => {
  const originalEnv = { ...process.env };

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("creates a pending session with the stable envelope schema", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const { createPendingSession, loadSession } = await import("../../src/lib/wallet-session.js");

    const session = createPendingSession();
    const loaded = loadSession();

    expect(session.envelopeVersion).toBe("v1");
    expect(session.status).toBe("pending");
    expect(session.publicKeyJwk.kty).toBe("EC");
    expect(session.publicKeyJwk.crv).toBe("P-256");
    expect(session.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(loaded).toMatchObject({
      sessionId: session.sessionId,
      envelopeVersion: "v1",
      status: "pending",
    });
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(new Date(session.createdAt).getTime());
  });

  it("supports swapping in a memory store without writing a session file", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-memory-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const {
      createMemoryWalletSessionStore,
      createPendingSession,
      loadSession,
      updateSession,
      clearSession,
      setWalletSessionStore,
    } = await import("../../src/lib/wallet-session.js");

    setWalletSessionStore(createMemoryWalletSessionStore());
    const session = createPendingSession();
    const updated = updateSession({
      status: "approved",
      chainType: "evm",
      evmWalletId: "wallet_123",
      evmAddress: "0x123",
      capabilities: {
        "evm.signAuthorization": true,
      },
    });

    expect(session.status).toBe("pending");
    expect(loadSession()).toMatchObject({
      sessionId: session.sessionId,
      status: "approved",
      chainType: "evm",
      evmWalletId: "wallet_123",
    });
    expect(updated?.capabilities?.["evm.signAuthorization"]).toBe(true);
    expect(existsSync(join(dirname(process.env.ALCHEMY_CONFIG), "wallet-session.json"))).toBe(false);
    expect(clearSession()).toBe(true);
    expect(loadSession()).toBeNull();
  });

  it("only treats approved, non-expired sessions as valid delegated sessions", async () => {
    const { isSessionValid } = await import("../../src/lib/wallet-session.js");

    expect(
      isSessionValid({
        sessionId: crypto.randomUUID(),
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
    ).toBe(false);

    expect(
      isSessionValid({
        sessionId: crypto.randomUUID(),
        status: "approved",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
    ).toBe(false);
  });

  it("can load raw stored session data even when expired", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-expired-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const {
      createMemoryWalletSessionStore,
      loadSession,
      loadStoredSession,
      setWalletSessionStore,
    } = await import("../../src/lib/wallet-session.js");

    setWalletSessionStore(createMemoryWalletSessionStore({
      sessionId: crypto.randomUUID(),
      status: "approved",
      createdAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      envelopeVersion: "v1",
      publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      privateKeyPem: "pem",
    }));

    expect(loadSession()).toBeNull();
    expect(loadStoredSession()).toMatchObject({
      status: "approved",
      envelopeVersion: "v1",
    });
  });
});
