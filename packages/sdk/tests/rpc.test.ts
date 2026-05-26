import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAlchemyRpcClient,
  networkRpcCall,
  globalRpcCall,
  RpcApiError,
  validateNetwork,
} from "../src/evm/index.js";

describe("SDK JSON-RPC client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses viem transport for network and global Alchemy URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x10" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: { ok: true } }), { status: 200 }));

    await expect(
      networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [], {
        baseDomain: "example.com",
        breadcrumb: "test-client",
      }),
    ).resolves.toBe("0x10");
    await expect(
      globalRpcCall("key-123", "wallet_getCallsStatus", ["0xabc"], {
        baseDomain: "example.com",
        breadcrumb: "test-client",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0][0]).toBe("https://eth-mainnet.g.example.com/v2/key-123");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.g.example.com/v2/key-123");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "Content-Type": "application/json",
      "x-alchemy-client-breadcrumb": "test-client",
    });
  });

  it("maps JSON-RPC and HTTP errors into RpcApiError", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, error: { code: -32602, message: "bad params" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    await expect(networkRpcCall("eth-mainnet", "key-123", "eth_getBalance", [])).rejects.toMatchObject({
      name: "RpcApiError",
      code: -32602,
      message: "bad params",
    });
    await expect(networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [])).rejects.toMatchObject({
      name: "RpcApiError",
      code: 429,
      status: 429,
      message: "rate limited",
    });
  });

  it("preserves JSON-RPC error bodies returned with HTTP failure status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, error: { code: -32601, message: "missing method" } }), {
        status: 400,
      }),
    );

    await expect(networkRpcCall("eth-mainnet", "key-123", "missing_method", [])).rejects.toMatchObject({
      code: -32601,
      status: undefined,
      message: "missing method",
    });
  });

  it("preserves auth HTTP status when auth failures include JSON-RPC bodies", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 0, error: { code: -32602, message: "bad auth params" } });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 401 }));

    await expect(networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [])).rejects.toMatchObject({
      code: 401,
      status: 401,
      message: body,
    });
  });

  it("redacts API keys from transport error messages", async () => {
    fetchMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED https://eth-mainnet.g.alchemy.com/v2/super-secret-key"),
    );

    let caught: unknown;
    try {
      await networkRpcCall("eth-mainnet", "super-secret-key", "eth_blockNumber", []);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RpcApiError);
    expect(caught).toMatchObject({
      name: "RpcApiError",
      message: expect.stringContaining("https://eth-mainnet.g.alchemy.com/v2/[REDACTED]"),
    });
    expect((caught as Error).message).not.toContain("super-secret-key");
  });

  it("supports explicit endpoint overrides for CLI and test routing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x10" }), { status: 200 }));

    await expect(
      networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [], {
        endpointUrl: "http://localhost:8545/rpc",
      }),
    ).resolves.toBe("0x10");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8545/rpc");
  });

  it("creates configured clients with per-request overrides", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 0, result: "0x10" }), { status: 200 }));

    const rpcClient = createAlchemyRpcClient({
      baseDomain: "example.com",
      breadcrumb: "configured-client",
    });

    await expect(
      rpcClient.networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [], {
        breadcrumb: "request-client",
      }),
    ).resolves.toBe("0x10");

    expect(fetchMock.mock.calls[0][0]).toBe("https://eth-mainnet.g.example.com/v2/key-123");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-alchemy-client-breadcrumb": "request-client",
    });
  });

  it("rejects unsafe network identifiers before fetch", async () => {
    expect(() => validateNetwork("https://evil.example")).toThrow(RpcApiError);
    await expect(networkRpcCall("eth-mainnet.evil", "key-123", "eth_blockNumber", [])).rejects.toMatchObject({
      code: -32602,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
