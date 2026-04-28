import { afterEach, describe, expect, it } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

let server: Server | undefined;

function createTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler);
    server.listen(0, () => {
      const addr = server?.address();
      if (typeof addr === "object" && addr) {
        resolve(`http://localhost:${addr.port}`);
      }
    });
  });
}

function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
    server = undefined;
  });
}

describe("wallet-api", () => {
  const originalEnv = { ...process.env };

  afterEach(async () => {
    process.env = { ...originalEnv };
    await closeServer();
  });

  it("creates wallet sessions against admin-api paths and unwraps data", async () => {
    let requestUrl = "";
    let authHeader = "";
    let requestBody = "";
    const baseUrl = await createTestServer((req, res) => {
      requestUrl = req.url ?? "";
      authHeader = req.headers.authorization ?? "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        requestBody += chunk;
      });
      req.on("end", () => {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          data: {
            sessionId: "session-123",
            approvalUrl: "https://dashboard.alchemy.com/approve/session-123",
            expiresAt: "2026-05-01T00:00:00.000Z",
          },
        }));
      });
    });
    process.env.ALCHEMY_ADMIN_API_BASE_URL = baseUrl;

    const { createRemoteWalletSession, getWalletApiBaseUrl } = await import("../../src/lib/wallet-api.js");
    const response = await createRemoteWalletSession("auth-token", {
      publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
      requestSignerVersion: "v1",
      chainType: "evm",
      capabilities: { "evm.signMessage": true },
      environment: {
        platform: "darwin",
        arch: "arm64",
        nodeVersion: "v22.0.0",
        interactive: true,
      },
    });

    expect(getWalletApiBaseUrl()).toBe(baseUrl);
    expect(requestUrl).toBe("/wallet/sessions");
    expect(authHeader).toBe("Bearer auth-token");
    expect(JSON.parse(requestBody)).toMatchObject({
      requestSignerVersion: "v1",
      chainType: "evm",
      capabilities: { "evm.signMessage": true },
    });
    expect(response).toEqual({
      sessionId: "session-123",
      approvalUrl: "https://dashboard.alchemy.com/approve/session-123",
      expiresAt: "2026-05-01T00:00:00.000Z",
    });
  });

  it("normalizes provider session fields into legacy CLI session fields", async () => {
    const baseUrl = await createTestServer((req, res) => {
      expect(req.url).toBe("/wallet/sessions/session-123");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        data: {
          sessionId: "session-123",
          status: "approved",
          expiresAt: "2026-05-01T00:00:00.000Z",
          providerAppId: "provider-app-1",
          walletId: "wallet-123",
          address: "0xabc123",
          providerKeyQuorumId: "quorum-123",
          providerSignerId: "signer-123",
          chainType: "evm",
          capabilities: {
            "evm.signMessage": true,
          },
        },
      }));
    });
    process.env.ALCHEMY_ADMIN_API_BASE_URL = baseUrl;

    const { getRemoteWalletSession } = await import("../../src/lib/wallet-api.js");
    const response = await getRemoteWalletSession("auth-token", "session-123");

    expect(response).toMatchObject({
      sessionId: "session-123",
      status: "approved",
      walletId: "wallet-123",
      address: "0xabc123",
      providerAppId: "provider-app-1",
      providerKeyQuorumId: "quorum-123",
      providerSignerId: "signer-123",
      privyAppId: "provider-app-1",
      privyKeyQuorumId: "quorum-123",
      privySignerId: "signer-123",
    });
  });

  it("normalizes uppercase session states from admin-api", async () => {
    const baseUrl = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        data: {
          sessionId: "session-123",
          status: "PENDING",
          expiresAt: "2026-05-01T00:00:00.000Z",
          chainType: "evm",
          capabilities: {
            "evm.signMessage": true,
          },
        },
      }));
    });
    process.env.ALCHEMY_ADMIN_API_BASE_URL = baseUrl;

    const { getRemoteWalletSession } = await import("../../src/lib/wallet-api.js");
    const response = await getRemoteWalletSession("auth-token", "session-123");

    expect(response.status).toBe("pending");
  });

  it("maps legacy signer binding fields onto admin-api signing routes", async () => {
    let requestUrl = "";
    let requestBody = "";
    const baseUrl = await createTestServer((req, res) => {
      requestUrl = req.url ?? "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        requestBody += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          data: {
            challengeId: crypto.randomUUID(),
            challenge: "payload-to-sign",
            expiresAt: "2026-05-01T00:00:00.000Z",
            requestExpiry: "1745798400",
            method: "personal_sign",
            walletId: "wallet-123",
            walletAddress: "0x1111111111111111111111111111111111111111",
            providerKeyQuorumId: "quorum-123",
            providerSignerId: "signer-123",
          },
        }));
      });
    });
    process.env.ALCHEMY_ADMIN_API_BASE_URL = baseUrl;

    const { createRemoteSignMessageChallenge } = await import("../../src/lib/wallet-api.js");
    const response = await createRemoteSignMessageChallenge("auth-token", {
      sessionId: crypto.randomUUID(),
      walletId: "wallet-123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      privyKeyQuorumId: "quorum-123",
      privySignerId: "signer-123",
      message: "hello",
      encoding: "utf-8",
    });

    expect(requestUrl).toBe("/wallet/evm/sign-message/challenge");
    expect(JSON.parse(requestBody)).toMatchObject({
      walletId: "wallet-123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      providerKeyQuorumId: "quorum-123",
      providerSignerId: "signer-123",
      message: "hello",
      encoding: "utf-8",
    });
    expect(response).toMatchObject({
      walletId: "wallet-123",
      walletAddress: "0x1111111111111111111111111111111111111111",
      privyKeyQuorumId: "quorum-123",
      privySignerId: "signer-123",
    });
  });
});
