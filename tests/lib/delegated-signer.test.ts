import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type { WalletSession } from "../../src/lib/wallet-session.js";

function buildSession(): WalletSession {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    sessionId: crypto.randomUUID(),
    status: "approved",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    envelopeVersion: "v1",
    publicKeyJwk: publicKey.export({ format: "jwk" }) as JsonWebKey,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    walletId: "wallet_123",
    evmWalletId: "wallet_123",
    evmAddress: "0x1111111111111111111111111111111111111111",
    privyKeyQuorumId: "quorum_123",
    capabilities: {
      "evm.signMessage": true,
      "evm.signTypedData": true,
      "evm.signAuthorization": true,
    },
  };
}

describe("delegated signer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("creates and completes sign-message challenge", async () => {
    const createRemoteSignMessageChallenge = vi.fn().mockResolvedValue({
      challengeId: crypto.randomUUID(),
      challenge: "payload-to-sign",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      requestExpiry: Date.now().toString(),
      method: "personal_sign",
      walletId: "wallet_123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      privyKeyQuorumId: "quorum_123",
    });
    const completeRemoteSignMessageChallenge = vi.fn().mockResolvedValue({
      signature: "0xdeadbeef",
      encoding: "hex",
    });

    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteSignMessageChallenge,
      completeRemoteSignMessageChallenge,
      createRemoteSignTypedDataChallenge: vi.fn(),
      completeRemoteSignTypedDataChallenge: vi.fn(),
      createRemoteSignAuthorizationChallenge: vi.fn(),
      completeRemoteSignAuthorizationChallenge: vi.fn(),
    }));

    const { createDelegatedAccount } = await import("../../src/lib/delegated-signer.js");
    const session = buildSession();
    const signer = createDelegatedAccount({
      authToken: "auth-token",
      session,
    });

    const signature = await (signer as any).signMessage({ message: "hello world" });

    expect(createRemoteSignMessageChallenge).toHaveBeenCalledWith("auth-token", expect.objectContaining({
      sessionId: session.sessionId,
      walletId: "wallet_123",
      walletAddress: session.evmAddress,
      message: "hello world",
      encoding: "utf-8",
    }));
    expect(completeRemoteSignMessageChallenge).toHaveBeenCalledWith("auth-token", {
      challengeId: createRemoteSignMessageChallenge.mock.calls[0]?.[1]?.challengeId ?? expect.any(String),
      signature: expect.any(String),
    });
    expect(signature).toBe("0xdeadbeef");
  });

  it("serializes bigint typed-data values before challenge request", async () => {
    const createRemoteSignTypedDataChallenge = vi.fn().mockResolvedValue({
      challengeId: crypto.randomUUID(),
      challenge: "typed-data-payload",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      requestExpiry: Date.now().toString(),
      method: "eth_signTypedData_v4",
      walletId: "wallet_123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      privyKeyQuorumId: "quorum_123",
    });
    const completeRemoteSignTypedDataChallenge = vi.fn().mockResolvedValue({
      signature: "0xbeadfeed",
      encoding: "hex",
    });

    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteSignMessageChallenge: vi.fn(),
      completeRemoteSignMessageChallenge: vi.fn(),
      createRemoteSignTypedDataChallenge,
      completeRemoteSignTypedDataChallenge,
      createRemoteSignAuthorizationChallenge: vi.fn(),
      completeRemoteSignAuthorizationChallenge: vi.fn(),
    }));

    const { createDelegatedAccount } = await import("../../src/lib/delegated-signer.js");
    const session = buildSession();
    const signer = createDelegatedAccount({
      authToken: "auth-token",
      session,
    });

    await (signer as any).signTypedData({
      account: session.evmAddress,
      domain: { name: "Alchemy", chainId: 1n },
      types: { Permit: [{ name: "value", type: "uint256" }] },
      primaryType: "Permit",
      message: { value: 42n },
    });

    expect(createRemoteSignTypedDataChallenge).toHaveBeenCalledWith("auth-token", expect.objectContaining({
      typedData: expect.objectContaining({
        domain: expect.objectContaining({ chainId: "1" }),
        message: expect.objectContaining({ value: "42" }),
      }),
    }));
    expect(completeRemoteSignTypedDataChallenge).toHaveBeenCalledWith("auth-token", {
      challengeId: expect.any(String),
      signature: expect.any(String),
    });
  });

  it("maps sign-authorization challenge and response fields", async () => {
    const createRemoteSignAuthorizationChallenge = vi.fn().mockResolvedValue({
      challengeId: crypto.randomUUID(),
      challenge: "authorization-payload",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      requestExpiry: Date.now().toString(),
      method: "eth_sign7702Authorization",
      walletId: "wallet_123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      privyKeyQuorumId: "quorum_123",
    });
    const completeRemoteSignAuthorizationChallenge = vi.fn().mockResolvedValue({
      authorization: {
        contract: "0x2222222222222222222222222222222222222222",
        chain_id: "0x1",
        nonce: "0x2",
        y_parity: 1,
        r: "0x1",
        s: "0x2",
      },
    });

    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteSignMessageChallenge: vi.fn(),
      completeRemoteSignMessageChallenge: vi.fn(),
      createRemoteSignTypedDataChallenge: vi.fn(),
      completeRemoteSignTypedDataChallenge: vi.fn(),
      createRemoteSignAuthorizationChallenge,
      completeRemoteSignAuthorizationChallenge,
    }));

    const { createDelegatedAccount } = await import("../../src/lib/delegated-signer.js");
    const session = buildSession();
    const signer = createDelegatedAccount({
      authToken: "auth-token",
      session,
    });

    const authorization = await (signer as any).signAuthorization({
      contractAddress: "0x2222222222222222222222222222222222222222",
      chainId: 1n,
      nonce: 2n,
      executor: "self",
    });

    expect(createRemoteSignAuthorizationChallenge).toHaveBeenCalledWith("auth-token", expect.objectContaining({
      authorization: {
        contract: "0x2222222222222222222222222222222222222222",
        chainId: "1",
        nonce: "2",
        executor: "self",
      },
    }));
    expect(authorization).toMatchObject({
      contractAddress: "0x2222222222222222222222222222222222222222",
      chainId: 1n,
      nonce: 2n,
      yParity: 1,
    });
  });
});
