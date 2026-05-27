import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import type { WalletSession } from "../../src/lib/wallet-session.js";

function makeProgram(): Command {
  return new Command();
}

function makeSession(overrides: Partial<WalletSession> = {}): WalletSession {
  return {
    sessionId: crypto.randomUUID(),
    status: "approved",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    envelopeVersion: "v1",
    publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
    privateKeyPem: "pem",
    walletId: "wallet_123",
    evmWalletId: "wallet_123",
    evmAddress: "0x1111111111111111111111111111111111111111",
    privyKeyQuorumId: "quorum_123",
    backendBaseUrl: "https://dashboard.alchemy.com/api",
    ...overrides,
  };
}

function doMockDeps(args: {
  validSession: WalletSession | null;
  storedSession?: WalletSession | null;
  localKey?: string;
  activeSigner?: "session" | "local";
  createDelegatedAccount?: ReturnType<typeof vi.fn>;
  privateKeyToAccount?: ReturnType<typeof vi.fn>;
  createSmartWalletClient?: ReturnType<typeof vi.fn>;
}) {
  const createDelegatedAccount = args.createDelegatedAccount ??
    vi.fn().mockReturnValue({ address: "0x1111111111111111111111111111111111111111" });
  const privateKeyToAccount = args.privateKeyToAccount ??
    vi.fn().mockReturnValue({ address: "0x2222222222222222222222222222222222222222" });
  const createSmartWalletClient = args.createSmartWalletClient ??
    vi.fn().mockReturnValue({ sendCalls: vi.fn() });

  vi.doMock("../../src/lib/resolve.js", () => ({
    resolveAPIKey: () => "api-key",
    resolveAuthToken: () => "auth-token",
    resolveActiveSigner: () => args.activeSigner,
    resolveWalletSession: () => args.validSession,
    resolveWalletKey: () => args.localKey,
    resolveNetwork: () => "eth-mainnet",
    resolveGasSponsored: () => false,
    resolveGasPolicyId: () => undefined,
  }));
  vi.doMock("../../src/lib/config.js", () => ({
    load: () => ({}),
  }));
  vi.doMock("../../src/lib/wallet-session.js", () => ({
    loadStoredSession: () =>
      args.storedSession !== undefined ? args.storedSession : args.validSession,
    getWalletSessionByChain: (session: WalletSession, chainType: "evm" | "solana") => {
      if (chainType === "evm" && session.evmAddress) return session;
      if (chainType === "solana" && session.solanaAddress) return session;
      return null;
    },
  }));
  vi.doMock("../../src/lib/chains.js", () => ({
    networkToChain: () => ({
      id: 1,
      name: "Ethereum",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["https://example.com"] } },
    }),
  }));
  vi.doMock("../../src/lib/delegated-signer.js", () => ({
    createDelegatedAccount,
  }));
  vi.doMock("@alchemy/wallet-apis", () => ({
    createSmartWalletClient,
    alchemyWalletTransport: vi.fn(() => "transport"),
  }));
  vi.doMock("viem/accounts", () => ({
    privateKeyToAccount,
  }));
  return { createDelegatedAccount, privateKeyToAccount, createSmartWalletClient };
}

describe("buildWalletClient", () => {
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    console.error = originalError;
  });

  it("picks session when valid session exists and no local key (default policy)", async () => {
    const { createDelegatedAccount } = doMockDeps({
      validSession: makeSession(),
      localKey: undefined,
    });

    const { buildWalletClient, resetDualConfigWarning } = await import(
      "../../src/lib/smart-wallet.js"
    );
    resetDualConfigWarning();
    const ctx = buildWalletClient(makeProgram());

    expect(createDelegatedAccount).toHaveBeenCalled();
    expect(ctx.address).toBe("0x1111111111111111111111111111111111111111");
  });

  it("picks local when no session and local key exists", async () => {
    const { privateKeyToAccount } = doMockDeps({
      validSession: null,
      storedSession: null,
      localKey: "abc123",
    });

    const { buildWalletClient, resetDualConfigWarning } = await import(
      "../../src/lib/smart-wallet.js"
    );
    resetDualConfigWarning();
    const ctx = buildWalletClient(makeProgram());

    expect(privateKeyToAccount).toHaveBeenCalledWith("0xabc123");
    expect(ctx.address).toBe("0x2222222222222222222222222222222222222222");
  });

  it("prefers session and warns when both are configured and no preference", async () => {
    const { createDelegatedAccount } = doMockDeps({
      validSession: makeSession(),
      localKey: "abc123",
    });

    const { buildWalletClient, resetDualConfigWarning } = await import(
      "../../src/lib/smart-wallet.js"
    );
    resetDualConfigWarning();
    const ctx = buildWalletClient(makeProgram());

    expect(createDelegatedAccount).toHaveBeenCalled();
    expect(ctx.address).toBe("0x1111111111111111111111111111111111111111");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Both session and local signers are configured"),
    );
  });

  it("uses local when active_signer=local even if session exists (no warning)", async () => {
    const { privateKeyToAccount } = doMockDeps({
      validSession: makeSession(),
      localKey: "abc123",
      activeSigner: "local",
    });

    const { buildWalletClient, resetDualConfigWarning } = await import(
      "../../src/lib/smart-wallet.js"
    );
    resetDualConfigWarning();
    const ctx = buildWalletClient(makeProgram());

    expect(privateKeyToAccount).toHaveBeenCalledWith("0xabc123");
    expect(ctx.address).toBe("0x2222222222222222222222222222222222222222");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("throws when active_signer=session but no valid session and a stored session exists (expired)", async () => {
    const expired = makeSession({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      status: "expired",
    });
    doMockDeps({
      validSession: null,
      storedSession: expired,
      localKey: "abc123",
      activeSigner: "session",
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    expect(() => buildWalletClient(makeProgram())).toThrow(
      "Your wallet session has expired or been revoked.",
    );
  });

  it("throws when active_signer=session but no stored session exists (never connected)", async () => {
    doMockDeps({
      validSession: null,
      storedSession: null,
      localKey: "abc123",
      activeSigner: "session",
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    expect(() => buildWalletClient(makeProgram())).toThrow(
      "No active wallet session",
    );
  });

  it("falls back to local silently when no preference + expired session + local key", async () => {
    const expired = makeSession({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      status: "expired",
    });
    const { privateKeyToAccount } = doMockDeps({
      validSession: null,
      storedSession: expired,
      localKey: "abc123",
    });

    const { buildWalletClient, resetDualConfigWarning } = await import(
      "../../src/lib/smart-wallet.js"
    );
    resetDualConfigWarning();
    const ctx = buildWalletClient(makeProgram());

    expect(privateKeyToAccount).toHaveBeenCalledWith("0xabc123");
    expect(ctx.address).toBe("0x2222222222222222222222222222222222222222");
  });

  it("perCall signer=local overrides active_signer=session", async () => {
    const { privateKeyToAccount } = doMockDeps({
      validSession: makeSession(),
      localKey: "abc123",
      activeSigner: "session",
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    const ctx = buildWalletClient(makeProgram(), { signer: "local" });

    expect(privateKeyToAccount).toHaveBeenCalledWith("0xabc123");
    expect(ctx.address).toBe("0x2222222222222222222222222222222222222222");
  });

  it("asks the user to connect a wallet when neither session nor local is configured", async () => {
    doMockDeps({
      validSession: null,
      storedSession: null,
      localKey: undefined,
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    expect(() => buildWalletClient(makeProgram())).toThrow(
      "No wallet connected. Run 'alchemy wallet connect'",
    );
  });

  it("asks for a local wallet when local signing is explicitly selected", async () => {
    doMockDeps({
      validSession: null,
      storedSession: null,
      localKey: undefined,
      activeSigner: "local",
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    expect(() => buildWalletClient(makeProgram())).toThrow(
      "No local wallet configured.",
    );
  });

  it("throws when session metadata is incomplete", async () => {
    const incomplete = makeSession({ backendBaseUrl: undefined });
    doMockDeps({
      validSession: incomplete,
      localKey: undefined,
    });

    const { buildWalletClient } = await import("../../src/lib/smart-wallet.js");
    expect(() => buildWalletClient(makeProgram())).toThrow(
      "Wallet session is missing backend metadata.",
    );
  });
});
