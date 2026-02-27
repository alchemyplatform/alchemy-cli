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
});
