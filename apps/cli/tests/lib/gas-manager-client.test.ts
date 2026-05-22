import { describe, it, expect, afterEach } from "vitest";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { GasManagerClient, type Policy } from "../../src/lib/gas-manager-client.js";

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

class TestGasManagerClient extends GasManagerClient {
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

function makePolicy(over: Partial<Policy> = {}): Policy {
  return {
    policyId: "0xabc123",
    appId: "app-1",
    status: "inactive",
    policyName: "Test Policy",
    policyType: "sponsorship",
    networks: ["ETH_MAINNET"],
    ...over,
  };
}

describe("GasManagerClient", () => {
  afterEach(async () => {
    await closeServer();
  });

  it("listPolicies sends GET with appId + pagination params", async () => {
    let capturedUrl = "";
    let capturedAuth = "";
    const url = await createTestServer((req, res) => {
      capturedUrl = req.url ?? "";
      capturedAuth = req.headers.authorization ?? "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        data: { policies: [makePolicy()], before: null, after: "cursor-2" },
      }));
    });

    const client = new TestGasManagerClient(url);
    const result = await client.listPolicies({ appId: "app-1", limit: 10, after: "cursor-1" });

    expect(capturedAuth).toBe("Bearer test-access-key");
    expect(capturedUrl).toContain("/api/gasManager/policies");
    expect(capturedUrl).toContain("appId=app-1");
    expect(capturedUrl).toContain("limit=10");
    expect(capturedUrl).toContain("after=cursor-1");
    expect(result.policies).toHaveLength(1);
    expect(result.after).toBe("cursor-2");
  });

  it("listAllPolicies paginates until cursor is exhausted", async () => {
    let calls = 0;
    const url = await createTestServer((req, res) => {
      calls += 1;
      res.writeHead(200, { "Content-Type": "application/json" });
      if (calls === 1) {
        res.end(JSON.stringify({
          data: { policies: [makePolicy({ policyId: "p1" })], before: null, after: "cursor-2" },
        }));
      } else {
        res.end(JSON.stringify({
          data: { policies: [makePolicy({ policyId: "p2" })], before: null, after: null },
        }));
      }
    });

    const client = new TestGasManagerClient(url);
    const policies = await client.listAllPolicies({ appId: "app-1" });
    expect(policies.map((p) => p.policyId)).toEqual(["p1", "p2"]);
    expect(calls).toBe(2);
  });

  it("createPolicy POSTs the payload and unwraps data.policy", async () => {
    let body = "";
    let method = "";
    const url = await createTestServer((req, res) => {
      method = req.method ?? "";
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { policy: makePolicy({ policyId: "new-1" }) } }));
      });
    });

    const client = new TestGasManagerClient(url);
    const created = await client.createPolicy({
      policyName: "New",
      policyType: "sponsorship",
      appId: "app-1",
      networks: ["ETH_MAINNET"],
      rules: { startTimeUnix: "100", sponsorshipExpiryMs: "600000" },
    });

    expect(method).toBe("POST");
    expect(created.policyId).toBe("new-1");
    const parsed = JSON.parse(body);
    expect(parsed.policyName).toBe("New");
    expect(parsed.networks).toEqual(["ETH_MAINNET"]);
  });

  it("setPolicyStatus PUTs the status endpoint", async () => {
    let path = "";
    let method = "";
    let body = "";
    const url = await createTestServer((req, res) => {
      method = req.method ?? "";
      path = req.url ?? "";
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        body = Buffer.concat(chunks).toString("utf8");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: { policy: makePolicy({ status: "active" }) } }));
      });
    });

    const client = new TestGasManagerClient(url);
    const updated = await client.setPolicyStatus("0xabc123", "active");

    expect(method).toBe("PUT");
    expect(path).toBe("/api/gasManager/policy/0xabc123/status");
    expect(JSON.parse(body)).toEqual({ status: "active" });
    expect(updated.status).toBe("active");
  });

  it("401 maps to INVALID_ACCESS_KEY", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(401);
      res.end();
    });
    const client = new TestGasManagerClient(url);
    await expect(client.getPolicy("0xabc")).rejects.toMatchObject({
      code: "INVALID_ACCESS_KEY",
    });
  });

  it("404 maps to NOT_FOUND", async () => {
    const url = await createTestServer((_req, res) => {
      res.writeHead(404);
      res.end("policy not found");
    });
    const client = new TestGasManagerClient(url);
    await expect(client.getPolicy("0xmissing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
