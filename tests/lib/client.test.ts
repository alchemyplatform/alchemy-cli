import { describe, it, expect, afterEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Client } from "../../src/lib/client.js";
import { CLIError, ErrorCode } from "../../src/lib/errors.js";

let server: Server;

function createTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler);
    server.listen(0, () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        resolve(`http://localhost:${addr.port}`);
      }
    });
  });
}

function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

// Test helper: Client subclass that overrides rpcURL to point at test server
class TestClient extends Client {
  private testURL: string;

  constructor(url: string) {
    super("test", "test");
    this.testURL = url;
  }

  override rpcURL(): string {
    return this.testURL;
  }
}

describe("Client URL construction", () => {
  it("builds correct RPC URL", () => {
    const c = new Client("mykey", "eth-mainnet");
    expect(c.rpcURL()).toBe("https://eth-mainnet.g.alchemy.com/v2/mykey");
  });

  it("builds correct Enhanced URL", () => {
    const c = new Client("mykey", "eth-mainnet");
    expect(c.enhancedURL()).toBe(
      "https://eth-mainnet.g.alchemy.com/nft/v3/mykey",
    );
  });
});

describe("Client.call", () => {
  afterEach(async () => {
    await closeServer();
  });

  it("returns result on success", async () => {
    const url = await createTestServer((req, res) => {
      let body = "";
      req.on("data", (chunk: string) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        expect(parsed.method).toBe("eth_blockNumber");
        expect(parsed.jsonrpc).toBe("2.0");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ jsonrpc: "2.0", result: "0x10d4f1", id: 1 }),
        );
      });
    });

    const client = new TestClient(url);
    const result = await client.call("eth_blockNumber");
    expect(result).toBe("0x10d4f1");
  });

  it("throws RPC error on JSON-RPC error", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
          id: 1,
        }),
      );
    });

    const client = new TestClient(url);
    try {
      await client.call("invalid_method");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.RPC_ERROR);
    }
  });

  it("throws on 401", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    const client = new TestClient(url);
    try {
      await client.call("eth_blockNumber");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_API_KEY);
    }
  });

  it("returns specific auth error when network is not enabled for app", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(
        "ROOTSTOCK_MAINNET is not enabled for this app. Visit this page to enable the network: https://dashboard.alchemy.com/apps/test/networks",
      );
    });

    const client = new TestClient(url);
    try {
      await client.call("eth_blockNumber");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.NETWORK_NOT_ENABLED);
      expect((err as CLIError).message).toContain(
        "rootstock-mainnet is not enabled for this app",
      );
      expect((err as CLIError).details).toContain(
        "ROOTSTOCK_MAINNET is not enabled for this app",
      );
      expect((err as CLIError).details).toContain(
        "https://dashboard.alchemy.com/apps/test/networks",
      );
      expect((err as CLIError).hint).toBeUndefined();
    }
  });

  it("throws RPC error when HTTP error body contains JSON-RPC error", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: "The method fake_method does not exist" },
          id: 1,
        }),
      );
    });

    const client = new TestClient(url);
    try {
      await client.call("fake_method");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.RPC_ERROR);
      expect((err as CLIError).message).toContain("-32601");
      expect((err as CLIError).hint).toBeDefined();
    }
  });

  it("throws network error when HTTP error body is not JSON-RPC", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(500);
      res.end("Internal Server Error");
    });

    const client = new TestClient(url);
    try {
      await client.call("eth_blockNumber");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.NETWORK_ERROR);
    }
  });

  it("throws on 429", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(429);
      res.end();
    });

    const client = new TestClient(url);
    try {
      await client.call("eth_blockNumber");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.RATE_LIMITED);
    }
  });
});
