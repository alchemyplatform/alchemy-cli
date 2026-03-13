import { afterEach, describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures.js";
import { runCLI } from "./helpers/run-cli.js";
import { startMockServer, type MockServer } from "./helpers/mock-server.js";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function parseJSON(text: string): unknown {
  return JSON.parse(text.trim());
}

describe("CLI mock E2E", () => {
  let server: MockServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("returns JSON balance and sends expected RPC payload", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        return { status: 200, json: FIXTURES.rpc.balanceSuccess };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "--network",
        "eth-mainnet",
        "balance",
        ADDRESS,
      ],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toEqual({
      address: ADDRESS,
      wei: "16",
      eth: "0.000000000000000016",
      network: "eth-mainnet",
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].method).toBe("POST");
    expect(server.requests[0].path).toBe("/v2/test-api-key");
    expect(server.requests[0].bodyJSON).toMatchObject({
      method: "eth_getBalance",
      params: [ADDRESS, "latest"],
    });
  });

  it("returns RPC error contract and exit code on JSON-RPC errors", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        return { status: 200, json: FIXTURES.rpc.rpcError };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--api-key", "test-api-key", "balance", ADDRESS],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(7);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "RPC_ERROR",
      },
    });
  });

  it("returns NOT_FOUND contract for tx lookup misses", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        return { status: 200, json: FIXTURES.rpc.txNotFound };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--api-key", "test-api-key", "tx", HASH],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(4);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "NOT_FOUND",
      },
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].bodyJSON).toMatchObject({
      method: "eth_getTransactionByHash",
      params: [HASH],
    });
  });

  it("lists apps via admin API and sends bearer auth header", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v1/apps") {
        return { status: 200, json: FIXTURES.admin.listAppsSuccess };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--access-key", "test-access-key", "apps", "list"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toMatchObject({
      apps: [
        {
          id: "app-123",
          name: "E2E App",
        },
      ],
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].headers.authorization).toBe(
      "Bearer test-access-key",
    );
  });

  it("apps list --all paginates in JSON mode for complete results", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v1/apps" && !request.query.get("cursor")) {
        return {
          status: 200,
          json: {
            data: {
              apps: [
                {
                  id: "app-1",
                  name: "Page One",
                  apiKey: "api-key-1",
                  webhookApiKey: "webhook-key-1",
                  chainNetworks: [],
                  createdAt: "2026-01-01T00:00:00Z",
                },
              ],
              cursor: "cursor_2",
            },
          },
        };
      }
      if (request.path === "/v1/apps" && request.query.get("cursor") === "cursor_2") {
        return {
          status: 200,
          json: {
            data: {
              apps: [
                {
                  id: "app-2",
                  name: "Page Two",
                  apiKey: "api-key-2",
                  webhookApiKey: "webhook-key-2",
                  chainNetworks: [],
                  createdAt: "2026-01-02T00:00:00Z",
                },
              ],
            },
          },
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--access-key", "test-access-key", "apps", "list", "--all"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      apps: [
        { id: "app-1", name: "Page One" },
        { id: "app-2", name: "Page Two" },
      ],
      pageInfo: {
        mode: "all",
        pages: 2,
        scannedApps: 2,
      },
    });
    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].headers.authorization).toBe(
      "Bearer test-access-key",
    );
    expect(server.requests[1].query.get("cursor")).toBe("cursor_2");
  });

  it("apps list --search scans pages and returns matches", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v1/apps" && !request.query.get("cursor")) {
        return {
          status: 200,
          json: {
            data: {
              apps: [
                {
                  id: "app-1",
                  name: "Page One",
                  apiKey: "api-key-1",
                  webhookApiKey: "webhook-key-1",
                  chainNetworks: [],
                  createdAt: "2026-01-01T00:00:00Z",
                },
              ],
              cursor: "cursor_2",
            },
          },
        };
      }
      if (request.path === "/v1/apps" && request.query.get("cursor") === "cursor_2") {
        return {
          status: 200,
          json: {
            data: {
              apps: [
                {
                  id: "target-2",
                  name: "Target App",
                  apiKey: "api-key-2",
                  webhookApiKey: "webhook-key-2",
                  chainNetworks: [],
                  createdAt: "2026-01-02T00:00:00Z",
                },
              ],
            },
          },
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--access-key", "test-access-key", "apps", "list", "--search", "target"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      apps: [{ id: "target-2", name: "Target App" }],
      pageInfo: {
        mode: "search",
        pages: 2,
        scannedApps: 2,
        search: "target",
      },
    });
    expect(server.requests).toHaveLength(2);
  });

  it("returns INVALID_ACCESS_KEY contract on admin auth failures", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v1/apps") {
        return { status: 401, text: "unauthorized" };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      ["--json", "--access-key", "test-access-key", "apps", "list"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(3);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "INVALID_ACCESS_KEY",
      },
    });
  });

  it("lists full RPC network catalog without auth", async () => {
    const result = await runCLI(["--json", "network", "list"]);

    expect(result.exitCode).toBe(0);
    const payload = parseJSON(result.stdout) as Array<{ id: string }>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload.length).toBeGreaterThan(100);
    expect(payload.some((network) => network.id === "eth-mainnet")).toBe(true);
    expect(payload.some((network) => network.id === "base-mainnet")).toBe(true);
  });

  it("lists configured app network slugs with access key mode", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v1/apps/app-123") {
        return {
          status: 200,
          json: {
            data: {
              id: "app-123",
              name: "Configured App",
              description: "test",
              apiKey: "api_key",
              webhookApiKey: "wh_key",
              chainNetworks: [
                {
                  id: "ETH_MAINNET",
                  name: "Ethereum Mainnet",
                  rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/api_key",
                },
                {
                  id: "BASE_SEPOLIA",
                  name: "Base Sepolia",
                  rpcUrl: "https://base-sepolia.g.alchemy.com/v2/api_key",
                },
              ],
              products: [],
              createdAt: "2025-01-01T00:00:00.000Z",
            },
          },
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--access-key",
        "test-access-key",
        "network",
        "list",
        "--configured",
        "--app-id",
        "app-123",
      ],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      mode: "configured",
      appId: "app-123",
      configuredNetworkIds: ["base-sepolia", "eth-mainnet"],
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].headers.authorization).toBe(
      "Bearer test-access-key",
    );
  });

  it("returns setup status JSON contract in an unconfigured home", async () => {
    const result = await runCLI(["--json", "setup", "status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      complete: false,
      satisfiedBy: null,
      missing: expect.any(Array),
      nextCommands: expect.any(Array),
    });
  });

  it("agent-prompt returns full agent contract JSON", async () => {
    const result = await runCLI(["--json", "agent-prompt"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const payload = parseJSON(result.stdout) as Record<string, unknown>;
    expect(payload).toHaveProperty("executionPolicy");
    expect(payload).toHaveProperty("preflight");
    expect(payload).toHaveProperty("auth");
    expect(payload).toHaveProperty("commands");
    expect(payload).toHaveProperty("errors");
    expect(payload).toHaveProperty("examples");
    expect(payload).toHaveProperty("docs");

    const commands = payload.commands as Array<{ name: string }>;
    expect(commands.length).toBeGreaterThan(10);
    expect(commands.some((c) => c.name === "balance")).toBe(true);
    expect(commands.some((c) => c.name === "agent-prompt")).toBe(false);
  });

  it("bare no-interactive returns SETUP_REQUIRED with remediation data", async () => {
    const result = await runCLI(["--json", "--no-interactive"]);

    expect(result.exitCode).toBe(3);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "SETUP_REQUIRED",
        data: {
          complete: false,
          satisfiedBy: null,
          missing: expect.any(Array),
          nextCommands: expect.any(Array),
        },
      },
    });
  });
});
