import { describe, it, expect, afterEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  AdminClient,
  type App,
  type ChainNetwork,
} from "../../src/lib/admin-client.js";
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

class TestAdminClient extends AdminClient {
  private testURL: string;
  private testHost: string;

  constructor(url: string) {
    super("test-access-key");
    this.testURL = url;
    this.testHost = new URL(url).hostname;
  }

  protected override baseURL(): string {
    return this.testURL;
  }

  protected override allowedHosts(): Set<string> {
    return new Set([this.testHost]);
  }

  protected override allowInsecureTransport(hostname: string): boolean {
    return hostname === this.testHost;
  }
}

const MOCK_APP: App = {
  id: "app-123",
  name: "Test App",
  apiKey: "test-api-key",
  webhookApiKey: "test-webhook-key",
  chainNetworks: [
    {
      name: "ETH_MAINNET",
      id: "ETH_MAINNET",
      rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/test",
    },
  ],
  createdAt: "2025-01-01T00:00:00Z",
};

const MOCK_CHAIN: ChainNetwork = {
  id: "ETH_MAINNET",
  name: "Ethereum Mainnet",
  networkChainId: "1",
  isTestnet: false,
  availability: "public",
  docsUrl: "https://docs.alchemy.com",
  explorerUrl: "https://etherscan.io",
  currency: "ETH",
};

describe("AdminClient", () => {
  afterEach(async () => {
    await closeServer();
  });

  it("sends Bearer token in Authorization header", async () => {
    let authHeader = "";
    const url = await createTestServer((req, res) => {
      authHeader = req.headers.authorization || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { networks: [] } }));
    });

    const client = new TestAdminClient(url);
    await client.listChains();
    expect(authHeader).toBe("Bearer test-access-key");
  });

  it("rejects empty access key in constructor", () => {
    try {
      new AdminClient("   ");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ACCESS_KEY);
    }
  });

  it("rejects access key containing whitespace", () => {
    try {
      new AdminClient("test access key");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ACCESS_KEY);
    }
  });

  it("rejects unexpected request host before fetch", async () => {
    class UnexpectedHostClient extends AdminClient {
      protected override baseURL(): string {
        return "https://example.com";
      }
    }

    const client = new UnexpectedHostClient("test-access-key");
    try {
      await client.listChains();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ARGS);
    }
  });

  it("rejects non-HTTPS transport unless explicitly allowed", async () => {
    class InsecureHostClient extends AdminClient {
      protected override baseURL(): string {
        return "http://admin-api.alchemy.com";
      }

      protected override allowedHosts(): Set<string> {
        return new Set(["admin-api.alchemy.com"]);
      }
    }

    const client = new InsecureHostClient("test-access-key");
    try {
      await client.listChains();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ARGS);
    }
  });

  it("listChains returns networks", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { networks: [MOCK_CHAIN] } }));
    });

    const client = new TestAdminClient(url);
    const chains = await client.listChains();
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe("ETH_MAINNET");
    expect(chains[0].isTestnet).toBe(false);
  });

  it("listChains supports data array shape", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [MOCK_CHAIN] }));
    });

    const client = new TestAdminClient(url);
    const chains = await client.listChains();
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe("ETH_MAINNET");
  });

  it("listChains supports data.chains shape", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { chains: [MOCK_CHAIN] } }));
    });

    const client = new TestAdminClient(url);
    const chains = await client.listChains();
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe("ETH_MAINNET");
  });

  it("listChains supports top-level chains shape", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ chains: [MOCK_CHAIN] }));
    });

    const client = new TestAdminClient(url);
    const chains = await client.listChains();
    expect(chains).toHaveLength(1);
    expect(chains[0].id).toBe("ETH_MAINNET");
  });

  it("listChains throws on unexpected response shape", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { unexpected: true } }));
    });

    const client = new TestAdminClient(url);
    await expect(client.listChains()).rejects.toBeInstanceOf(CLIError);
    await expect(client.listChains()).rejects.toMatchObject({
      code: ErrorCode.ADMIN_API_ERROR,
    });
  });

  it("listApps returns apps", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { apps: [MOCK_APP] } }));
    });

    const client = new TestAdminClient(url);
    const result = await client.listApps();
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0].id).toBe("app-123");
  });

  it("listApps passes query params", async () => {
    let requestUrl = "";
    const url = await createTestServer((req, res) => {
      requestUrl = req.url || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { apps: [] } }));
    });

    const client = new TestAdminClient(url);
    await client.listApps({ cursor: "abc", limit: 10 });
    expect(requestUrl).toContain("cursor=abc");
    expect(requestUrl).toContain("limit=10");
  });

  it("getApp returns single app", async () => {
    let requestUrl = "";
    const url = await createTestServer((req, res) => {
      requestUrl = req.url || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: MOCK_APP }));
    });

    const client = new TestAdminClient(url);
    const app = await client.getApp("app-123");
    expect(app.id).toBe("app-123");
    expect(requestUrl).toBe("/v1/apps/app-123");
  });

  it("createApp sends correct body", async () => {
    let body = "";
    const url = await createTestServer((req, res) => {
      let data = "";
      req.on("data", (chunk: string) => (data += chunk));
      req.on("end", () => {
        body = data;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: MOCK_APP }));
      });
    });

    const client = new TestAdminClient(url);
    await client.createApp({ name: "Test", networks: ["ETH_MAINNET"] });
    const parsed = JSON.parse(body);
    expect(parsed.name).toBe("Test");
    expect(parsed.chainNetworks).toEqual(["ETH_MAINNET"]);
  });

  it("deleteApp sends DELETE request", async () => {
    let method = "";
    let requestUrl = "";
    const url = await createTestServer((req, res) => {
      method = req.method || "";
      requestUrl = req.url || "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({}));
    });

    const client = new TestAdminClient(url);
    await client.deleteApp("app-123");
    expect(method).toBe("DELETE");
    expect(requestUrl).toBe("/v1/apps/app-123");
  });

  it("updateApp sends PATCH with body", async () => {
    let method = "";
    let body = "";
    const url = await createTestServer((req, res) => {
      method = req.method || "";
      let data = "";
      req.on("data", (chunk: string) => (data += chunk));
      req.on("end", () => {
        body = data;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: MOCK_APP }));
      });
    });

    const client = new TestAdminClient(url);
    await client.updateApp("app-123", { name: "Updated" });
    expect(method).toBe("PATCH");
    expect(JSON.parse(body).name).toBe("Updated");
  });

  // Error handling tests

  it("throws INVALID_ACCESS_KEY on 401", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });

    const client = new TestAdminClient(url);
    try {
      await client.listApps();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ACCESS_KEY);
    }
  });

  it("throws INVALID_ACCESS_KEY on 403", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(403);
      res.end();
    });

    const client = new TestAdminClient(url);
    try {
      await client.listApps();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.INVALID_ACCESS_KEY);
    }
  });

  it("throws NOT_FOUND on 404", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(404);
      res.end("not found");
    });

    const client = new TestAdminClient(url);
    try {
      await client.getApp("missing");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it("throws RATE_LIMITED on 429", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(429);
      res.end();
    });

    const client = new TestAdminClient(url);
    try {
      await client.listApps();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.RATE_LIMITED);
    }
  });

  it("throws ADMIN_API_ERROR on other errors", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(500);
      res.end("internal error");
    });

    const client = new TestAdminClient(url);
    try {
      await client.listApps();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      expect((err as CLIError).code).toBe(ErrorCode.ADMIN_API_ERROR);
    }
  });
});
