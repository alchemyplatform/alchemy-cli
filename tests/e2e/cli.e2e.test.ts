import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { FIXTURES } from "./fixtures.js";
import { runCLI } from "./helpers/run-cli.js";
import { startMockServer, type MockServer } from "./helpers/mock-server.js";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TEST_PRIVATE_KEY =
  "0x59c6995e998f97a5a004497e5da6f4da5e0a30ca3c8db0c0d4fc2b2b9b3d73c5";
const TEST_ACCOUNT = privateKeyToAccount(TEST_PRIVATE_KEY).address;
const CURRENT_VERSION = (
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

function parseJSON(text: string): unknown {
  return JSON.parse(text.trim());
}

function rpcResult(id: unknown, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function quoteResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quote: {
      fromAmount: "0xde0b6b3a7640000",
      minimumToAmount: "0x2386f26fc10000",
      expiry: "0x7b",
    },
    chainId: "0x1",
    rawCalls: true,
    calls: [{ to: RECIPIENT, value: "0x0" }],
    ...overrides,
  };
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
        "evm",
        "data",
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
      balance: "0.000000000000000016",
      symbol: "ETH",
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

  it("keeps DNS/fetch failures as NETWORK_ERROR for valid network slugs", async () => {
    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "--network",
        "eth-mainnet",
        "evm",
        "data",
        "balance",
        ADDRESS,
      ],
      { ALCHEMY_RPC_BASE_URL: "http://127.0.0.1:1" },
    );

    expect(result.exitCode).toBe(6);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "NETWORK_ERROR",
      },
    });
  });

  it("rejects unknown network slugs before attempting RPC", async () => {
    const result = await runCLI([
      "--json",
      "--api-key",
      "test-api-key",
      "--network",
      "unknown-network",
      "evm",
      "data",
      "balance",
      ADDRESS,
    ]);

    expect(result.exitCode).toBe(2);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "INVALID_ARGS",
        message: expect.stringContaining("Unknown network 'unknown-network'"),
      },
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
      ["--json", "--api-key", "test-api-key", "evm", "data", "balance", ADDRESS],
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
      ["--json", "--api-key", "test-api-key", "evm", "tx", HASH],
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
      ["--json", "app", "list"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL, ALCHEMY_ACCESS_KEY: "test-access-key" },
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

  it("app list --all paginates in JSON mode for complete results", async () => {
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
      ["--json", "app", "list", "--all"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL, ALCHEMY_ACCESS_KEY: "test-access-key" },
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

  it("app list --search scans pages and returns matches", async () => {
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
      ["--json", "app", "list", "--search", "target"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL, ALCHEMY_ACCESS_KEY: "test-access-key" },
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
      ["--json", "app", "list"],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL, ALCHEMY_ACCESS_KEY: "test-access-key" },
    );

    expect(result.exitCode).toBe(3);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "INVALID_ACCESS_KEY",
      },
    });
  });

  it("lists full RPC network catalog without auth", async () => {
    const result = await runCLI(["--json", "evm", "network", "list"]);

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
        "app",
        "configured-networks",
        "--app-id",
        "app-123",
      ],
      { ALCHEMY_ADMIN_API_BASE_URL: server.baseURL, ALCHEMY_ACCESS_KEY: "test-access-key" },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      appId: "app-123",
      appName: "Configured App",
      networks: ["base-sepolia", "eth-mainnet"],
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].headers.authorization).toBe(
      "Bearer test-access-key",
    );
  });

  it("returns config status JSON contract in an unconfigured home", async () => {
    const result = await runCLI(["--json", "config", "status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toMatchObject({
      complete: false,
      satisfiedBy: null,
      missing: expect.any(Array),
      nextCommands: expect.any(Array),
      capabilities: {
        rpc_data: expect.objectContaining({ complete: false }),
        admin_api: expect.objectContaining({ complete: false }),
        notify_webhooks: expect.objectContaining({ complete: false }),
        wallet_signing: expect.objectContaining({ complete: false }),
        x402: expect.objectContaining({ complete: false }),
      },
    });
  });

  it("doctor returns capability-scoped readiness JSON", async () => {
    const result = await runCLI(["--json", "doctor"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const payload = parseJSON(result.stdout) as {
      checks: {
        setup: { capabilities: Record<string, unknown> };
        capabilities: Record<string, unknown>;
      };
    };
    expect(payload).toMatchObject({
      ok: false,
      checks: {
        setup: {
          capabilities: expect.objectContaining({
            rpc_data: expect.objectContaining({ complete: false }),
            admin_api: expect.objectContaining({ complete: false }),
          }),
        },
        capabilities: expect.objectContaining({
          notify_webhooks: expect.objectContaining({ complete: false }),
          wallet_signing: expect.objectContaining({ complete: false }),
        }),
      },
    });
    expect(payload.checks.setup.capabilities).not.toHaveProperty("x402");
    expect(payload.checks.capabilities).not.toHaveProperty("x402");
    expect(result.stdout).not.toContain("x402");
  });

  it("doctor omits x402 when x402 is the configured setup path", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "alchemy-cli-doctor-"));
    const configPath = join(configDir, "config.json");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        x402: true,
        wallet_key_file: "/tmp/alchemy-test-wallet-key",
      }),
    );

    const result = await runCLI(
      ["--json", "doctor"],
      { ALCHEMY_CONFIG: configPath },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const payload = parseJSON(result.stdout) as {
      ok: boolean;
      checks: {
        setup: {
          complete: boolean;
          satisfiedBy: string | null;
          missing: string[];
          nextCommands: string[];
          capabilities: Record<string, { complete: boolean; missing: string[] }>;
        };
        capabilities: Record<string, unknown>;
      };
    };
    expect(payload.ok).toBe(false);
    expect(payload.checks.setup).toMatchObject({
      complete: false,
      satisfiedBy: null,
      missing: ["Provide one auth path: alchemy auth OR api-key OR ALCHEMY_ACCESS_KEY+app"],
    });
    expect(payload.checks.setup.nextCommands.join("\n")).not.toMatch(/x402|siwx/i);
    expect(payload.checks.setup.capabilities.rpc_data).toMatchObject({
      complete: false,
      missing: ["api-key"],
    });
    expect(payload.checks.setup.capabilities).not.toHaveProperty("x402");
    expect(payload.checks.capabilities).not.toHaveProperty("x402");
    expect(result.stdout).not.toMatch(/x402|siwx/i);
  });

  it("block --summary returns compact JSON while default JSON remains full", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        const body = request.bodyJSON as { id?: unknown };
        return {
          status: 200,
          json: rpcResult(body.id, {
            number: "0x10",
            hash: "0xblock",
            timestamp: "0x1",
            transactions: ["0xtx1", "0xtx2"],
            miner: "0xmined",
            gasUsed: "0x100",
            gasLimit: "0x200",
            extraData: "0xlarge",
          }),
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const full = await runCLI(
      ["--json", "--api-key", "test-api-key", "evm", "block", "latest"],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );
    const summary = await runCLI(
      ["--json", "--api-key", "test-api-key", "evm", "block", "latest", "--summary"],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );

    expect(full.exitCode).toBe(0);
    expect(parseJSON(full.stdout)).toMatchObject({ extraData: "0xlarge" });
    expect(summary.exitCode).toBe(0);
    expect(parseJSON(summary.stdout)).toEqual({
      number: "0x10",
      hash: "0xblock",
      timestamp: "0x1",
      transactionCount: 2,
      miner: "0xmined",
      gasUsed: "0x100",
      gasLimit: "0x200",
    });
  });

  it("logs --limit truncates JSON output and preserves total count metadata", async () => {
    const logs = [
      {
        address: USDC,
        topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
        data: "0x0",
        blockNumber: "0x10",
        transactionHash: HASH,
        transactionIndex: "0x0",
        blockHash: "0xblock",
        logIndex: "0x0",
        removed: false,
      },
      {
        address: USDC,
        topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],
        data: "0x0",
        blockNumber: "0x11",
        transactionHash: HASH,
        transactionIndex: "0x0",
        blockHash: "0xblock2",
        logIndex: "0x1",
        removed: false,
      },
    ];

    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        const body = request.bodyJSON as { id?: unknown };
        return { status: 200, json: rpcResult(body.id, logs) };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "evm",
        "logs",
        "--from-block",
        "latest",
        "--to-block",
        "latest",
        "--limit",
        "1",
      ],
      { ALCHEMY_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toMatchObject({
      count: 1,
      totalCount: 2,
      truncated: true,
      logs: [logs[0]],
      network: "eth-mainnet",
    });
  });

  it("portfolio --limit truncates arrays through the mocked Data API backend", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/data/v1/test-api-key/assets/tokens/by-address") {
        return {
          status: 200,
          json: {
            items: [{ symbol: "ETH" }, { symbol: "USDC" }],
            owners: [{ address: "0x1" }, { address: "0x2" }],
          },
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const body = JSON.stringify({
      addresses: [{ address: ADDRESS, networks: ["eth-mainnet"] }],
    });
    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "evm",
        "data",
        "portfolio",
        "tokens",
        "--body",
        body,
        "--limit",
        "1",
      ],
      { ALCHEMY_DATA_API_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toEqual({
      items: [{ symbol: "ETH" }],
      owners: [{ address: "0x1" }],
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].method).toBe("POST");
    expect(server.requests[0].bodyJSON).toEqual(JSON.parse(body));
  });

  it("swap quote --from-address sends the quote account to the mocked Wallet RPC backend", async () => {
    server = await startMockServer((request) => {
      const body = request.bodyJSON as {
        id?: unknown;
        method?: string;
        params?: Array<Record<string, unknown>>;
      };
      if (body.method === "wallet_requestQuote_v0") {
        return { status: 200, json: rpcResult(body.id, quoteResult()) };
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
        "evm",
        "swap",
        "quote",
        "--from",
        NATIVE_TOKEN,
        "--to",
        NATIVE_TOKEN,
        "--amount",
        "1.0",
        "--from-address",
        ADDRESS,
      ],
      { ALCHEMY_WALLET_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toMatchObject({
      fromToken: NATIVE_TOKEN,
      toToken: NATIVE_TOKEN,
      fromAddress: ADDRESS,
      fromAmount: "1.0",
      minimumOutput: "0.01",
      network: "eth-mainnet",
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].headers.authorization).toBe("Bearer test-api-key");
    expect(server.requests[0].bodyJSON).toMatchObject({
      method: "wallet_requestQuote_v0",
      params: [
        expect.objectContaining({
          from: ADDRESS,
          chainId: "0x1",
          fromToken: NATIVE_TOKEN,
          toToken: NATIVE_TOKEN,
          fromAmount: "0xde0b6b3a7640000",
        }),
      ],
    });
  });

  it("swap quote normalizes mocked Wallet RPC quote errors", async () => {
    server = await startMockServer((request) => {
      const body = request.bodyJSON as { id?: unknown; method?: string };
      if (body.method === "wallet_requestQuote_v0") {
        return {
          status: 200,
          json: rpcError(
            body.id,
            -32603,
            "execution reverted: ERC20 transfer amount exceeds balance",
          ),
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "evm",
        "swap",
        "quote",
        "--from",
        NATIVE_TOKEN,
        "--to",
        NATIVE_TOKEN,
        "--amount",
        "1.0",
        "--from-address",
        ADDRESS,
      ],
      { ALCHEMY_WALLET_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(10);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "QUOTE_FAILED",
        message: expect.stringContaining("insufficient balance"),
        data: { cause: "INSUFFICIENT_BALANCE" },
      },
    });
  });

  it("bridge quote --from-address sends source and destination chains to the mocked Wallet RPC backend", async () => {
    server = await startMockServer((request) => {
      const body = request.bodyJSON as { id?: unknown; method?: string };
      if (body.method === "wallet_requestQuote_v0") {
        return { status: 200, json: rpcResult(body.id, quoteResult({ chainId: "0x1" })) };
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
        "xchain",
        "bridge",
        "quote",
        "--from",
        NATIVE_TOKEN,
        "--to",
        NATIVE_TOKEN,
        "--amount",
        "1.0",
        "--to-network",
        "base-mainnet",
        "--from-address",
        ADDRESS,
      ],
      { ALCHEMY_WALLET_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toMatchObject({
      fromToken: NATIVE_TOKEN,
      toToken: NATIVE_TOKEN,
      fromAddress: ADDRESS,
      fromNetwork: "eth-mainnet",
      toNetwork: "base-mainnet",
      minimumOutput: "0.01",
    });
    expect(server.requests[0].bodyJSON).toMatchObject({
      method: "wallet_requestQuote_v0",
      params: [
        expect.objectContaining({
          from: ADDRESS,
          chainId: "0x1",
          toChainId: "0x2105",
        }),
      ],
    });
  });

  it("bridge quote normalizes mocked Wallet RPC route failures", async () => {
    server = await startMockServer((request) => {
      const body = request.bodyJSON as { id?: unknown; method?: string };
      if (body.method === "wallet_requestQuote_v0") {
        return { status: 200, json: rpcError(body.id, -32603, "no route found") };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "xchain",
        "bridge",
        "quote",
        "--from",
        NATIVE_TOKEN,
        "--to",
        NATIVE_TOKEN,
        "--amount",
        "1.0",
        "--to-network",
        "base-mainnet",
        "--from-address",
        ADDRESS,
      ],
      { ALCHEMY_WALLET_RPC_BASE_URL: server.baseURL },
    );

    expect(result.exitCode).toBe(10);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "QUOTE_FAILED",
        message: expect.stringContaining("no route or insufficient liquidity"),
        data: { cause: "INSUFFICIENT_LIQUIDITY" },
      },
    });
  });

  it("evm send --dry-run previews a native transfer without backend requests", async () => {
    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "evm",
        "send",
        RECIPIENT,
        "0.5",
        "--dry-run",
      ],
      { ALCHEMY_WALLET_KEY: TEST_PRIVATE_KEY },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toEqual({
      dryRun: true,
      action: "evm-send",
      from: TEST_ACCOUNT,
      to: RECIPIENT,
      amount: "0.5",
      token: "ETH",
      tokenAddress: null,
      network: "eth-mainnet",
      sponsored: false,
      calls: [{ to: RECIPIENT, value: "500000000000000000" }],
    });
  });

  it("evm send --dry-run previews ERC-20 call data after mocked token metadata lookup", async () => {
    server = await startMockServer((request) => {
      if (request.path === "/v2/test-api-key") {
        const body = request.bodyJSON as { id?: unknown };
        return {
          status: 200,
          json: rpcResult(body.id, { decimals: 6, symbol: "USDC" }),
        };
      }
      return { status: 404, text: "unknown path" };
    });

    const result = await runCLI(
      [
        "--json",
        "--api-key",
        "test-api-key",
        "evm",
        "send",
        RECIPIENT,
        "1.25",
        "--token",
        USDC,
        "--dry-run",
      ],
      {
        ALCHEMY_RPC_BASE_URL: server.baseURL,
        ALCHEMY_WALLET_KEY: TEST_PRIVATE_KEY,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(parseJSON(result.stdout)).toMatchObject({
      dryRun: true,
      action: "evm-send",
      from: TEST_ACCOUNT,
      to: RECIPIENT,
      amount: "1.25",
      token: USDC,
      tokenAddress: USDC,
      network: "eth-mainnet",
      sponsored: false,
      calls: [
        {
          to: USDC,
          data: expect.stringMatching(/^0xa9059cbb/),
        },
      ],
    });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].bodyJSON).toMatchObject({
      method: "alchemy_getTokenMetadata",
      params: [USDC],
    });
  });

  it("agent-prompt returns full agent contract JSON", async () => {
    const result = await runCLI(["--json", "agent-prompt"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const payload = parseJSON(result.stdout) as Record<string, unknown>;
    expect(payload).toHaveProperty("executionPolicy");
    expect(payload).toHaveProperty("preflight");
    expect(payload).toHaveProperty("runtimeDiscovery");
    expect(payload).toHaveProperty("auth");
    expect(payload).toHaveProperty("commands");
    expect(payload).toHaveProperty("errors");
    expect(payload).toHaveProperty("examples");
    expect(payload).toHaveProperty("docs");

    const commands = payload.commands as Array<{ name: string }>;
    expect(commands.length).toBeGreaterThan(10);
    expect(commands.some((c) => c.name === "evm")).toBe(true);
    expect(commands.some((c) => c.name === "update-check")).toBe(true);
    expect(commands.some((c) => c.name === "agent-prompt")).toBe(false);
    expect(payload.runtimeDiscovery).toMatchObject({
      latest: {
        command: "npx -y @alchemy/cli@latest --json --no-interactive agent-prompt",
      },
    });
    expect(payload.examples).toContain("alchemy --json --no-interactive update-check");
    expect(payload.examples).toContain(
      "alchemy --json --no-interactive evm data balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --api-key $ALCHEMY_API_KEY",
    );
  });

  it("returns update status JSON from the cached version check", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "alchemy-cli-update-check-"));
    const configPath = join(configDir, "config.json");
    const checkedAt = Date.now();
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, ".update-check"),
      JSON.stringify({ latest: "9.9.9", checkedAt }),
    );

    const result = await runCLI(
      ["--json", "--no-interactive", "update-check"],
      { ALCHEMY_CONFIG: configPath },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseJSON(result.stdout)).toEqual({
      currentVersion: CURRENT_VERSION,
      latestVersion: "9.9.9",
      updateAvailable: true,
      installCommand: "npm i -g @alchemy/cli@latest",
      checkedAt,
    });
  });

  it("prints version for -v without falling through to the root action", async () => {
    const result = await runCLI(["-v"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe(CURRENT_VERSION);
  });

  it("returns INVALID_ARGS for unknown commands instead of setup fallback", async () => {
    const result = await runCLI(["--json", "wat"]);

    expect(result.exitCode).toBe(2);
    expect(parseJSON(result.stderr)).toMatchObject({
      error: {
        code: "INVALID_ARGS",
        message: "Unknown command 'wat'. Run 'alchemy help' for available commands.",
      },
    });
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
