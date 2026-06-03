import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("does not persist delegated transaction capabilities older CLIs reject", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-capabilities-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const {
      createPendingSession,
      updateSession,
    } = await import("../../src/lib/wallet-session.js");

    createPendingSession();
    updateSession({
      status: "approved",
      chainType: "evm",
      evmWalletId: "wallet_123",
      evmAddress: "0x123",
      capabilities: {
        "evm.signMessage": true,
        "evm.prepareCalls": true,
        "evm.sendCalls": true,
      },
      sessionsByChain: {
        evm: {
          sessionId: crypto.randomUUID(),
          status: "approved",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          chainType: "evm",
          walletId: "wallet_123",
          walletAddress: "0x123",
          capabilities: {
            "evm.signMessage": true,
            "evm.prepareCalls": true,
            "evm.sendCalls": true,
          },
        },
      },
    });

    const raw = JSON.parse(
      readFileSync(join(dirname(process.env.ALCHEMY_CONFIG), "wallet-session.json"), "utf-8"),
    );

    expect(JSON.stringify(raw)).not.toContain("evm.prepareCalls");
    expect(JSON.stringify(raw)).not.toContain("evm.sendCalls");
    expect(raw).toMatchObject({
      capabilities: {
        "evm.signMessage": true,
      },
      sessionsByChain: {
        evm: {
          capabilities: {
            "evm.signMessage": true,
          },
        },
      },
    });
  });

  it("loads previously persisted delegated transaction capabilities", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-capabilities-load-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const {
      createPendingSession,
      loadStoredSession,
    } = await import("../../src/lib/wallet-session.js");

    const session = createPendingSession();
    writeFileSync(
      join(dirname(process.env.ALCHEMY_CONFIG), "wallet-session.json"),
      JSON.stringify(
        {
          ...session,
          status: "approved",
          chainType: "evm",
          evmWalletId: "wallet_123",
          evmAddress: "0x123",
          capabilities: {
            "evm.prepareCalls": true,
            "evm.sendCalls": true,
            "evm.futureCapability": true,
          },
          sessionsByChain: {
            evm: {
              sessionId: crypto.randomUUID(),
              status: "approved",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              chainType: "evm",
              walletId: "wallet_123",
              walletAddress: "0x123",
              capabilities: {
                "evm.prepareCalls": true,
                "evm.sendCalls": true,
              },
            },
          },
        },
        null,
        2,
      ) + "\n",
    );

    const loaded = loadStoredSession();
    const loadedCapabilities = loaded?.capabilities as
      | Record<string, boolean>
      | undefined;

    expect(loaded).toMatchObject({
      capabilities: {
        "evm.prepareCalls": true,
        "evm.sendCalls": true,
      },
      sessionsByChain: {
        evm: {
          capabilities: {
            "evm.prepareCalls": true,
            "evm.sendCalls": true,
          },
        },
      },
    });
    expect(loadedCapabilities?.["evm.futureCapability"]).toBe(true);
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

  it("loads multichain sessions when any chain session remains usable", async () => {
    const {
      createMemoryWalletSessionStore,
      loadSession,
      setWalletSessionStore,
    } = await import("../../src/lib/wallet-session.js");
    const evmSessionId = crypto.randomUUID();
    const solanaSessionId = crypto.randomUUID();

    setWalletSessionStore(createMemoryWalletSessionStore({
      sessionId: evmSessionId,
      status: "revoked",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      envelopeVersion: "v1",
      publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      privateKeyPem: "pem",
      chainType: "both",
      sessionsByChain: {
        evm: {
          sessionId: evmSessionId,
          status: "revoked",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          chainType: "evm",
          walletId: "evm-wallet",
          walletAddress: "0xabc123",
        },
        solana: {
          sessionId: solanaSessionId,
          status: "approved",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          chainType: "solana",
          walletId: "solana-wallet",
          walletAddress: "SoLaNaSessionAddress",
        },
      },
    }));

    expect(loadSession()).toMatchObject({
      sessionsByChain: {
        solana: {
          sessionId: solanaSessionId,
          status: "approved",
        },
      },
    });
  });

  it("only returns approved, non-expired chain sessions by chain", async () => {
    const { getWalletSessionByChain } = await import("../../src/lib/wallet-session.js");
    const evmSessionId = crypto.randomUUID();
    const solanaSessionId = crypto.randomUUID();
    const session = {
      sessionId: evmSessionId,
      status: "approved" as const,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      envelopeVersion: "v1",
      publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      privateKeyPem: "pem",
      chainType: "both",
      sessionsByChain: {
        evm: {
          sessionId: evmSessionId,
          status: "expired" as const,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          chainType: "evm" as const,
          walletId: "evm-wallet",
          walletAddress: "0xabc123",
        },
        solana: {
          sessionId: solanaSessionId,
          status: "approved" as const,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          chainType: "solana" as const,
          walletId: "solana-wallet",
          walletAddress: "SoLaNaSessionAddress",
        },
      },
    };

    expect(getWalletSessionByChain(session, "evm")).toBeNull();
    expect(getWalletSessionByChain(session, "solana")).toMatchObject({
      sessionId: solanaSessionId,
      solanaWalletId: "solana-wallet",
      solanaAddress: "SoLaNaSessionAddress",
    });
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

  it("persists session environment client instance ids", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "alchemy-wallet-session-client-"));
    process.env.ALCHEMY_CONFIG = join(tempDir, "config.json");

    const {
      createMemoryWalletSessionStore,
      createPendingSession,
      loadStoredSession,
      setWalletSessionStore,
      updateSession,
    } = await import("../../src/lib/wallet-session.js");

    setWalletSessionStore(createMemoryWalletSessionStore());
    createPendingSession();
    updateSession({
      environment: {
        platform: "darwin",
        arch: "arm64",
        nodeVersion: "v22.0.0",
        interactive: true,
        clientInstanceId: "11111111-1111-4111-8111-111111111111",
        clientInstanceName: "Chris Laptop",
      },
    });

    expect(loadStoredSession()?.environment).toStrictEqual({
      platform: "darwin",
      arch: "arm64",
      nodeVersion: "v22.0.0",
      interactive: true,
      clientInstanceId: "11111111-1111-4111-8111-111111111111",
      clientInstanceName: "Chris Laptop",
    });
  });
});
