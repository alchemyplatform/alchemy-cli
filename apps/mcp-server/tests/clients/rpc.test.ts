import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpRpcClient, RpcApiError, validateNetwork } from "../../src/clients/rpc.js";

describe("RPC client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.ALCHEMY_BASE_DOMAIN = "example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ALCHEMY_BASE_DOMAIN;
  });

  it("posts JSON-RPC requests to the network gateway", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x10" }), {
        status: 200,
      }),
    );

    await expect(mcpRpcClient.networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [])).resolves.toBe("0x10");

    const requestBody = fetchMock.mock.calls[0][1].body;
    expect(requestBody).toEqual(expect.any(String));
    const body = JSON.parse(requestBody as string);
    expect(body).toMatchObject({ jsonrpc: "2.0", method: "eth_blockNumber", params: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://eth-mainnet.g.example.com/v2/key-123",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
        },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("posts global JSON-RPC requests to the API gateway", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }), {
        status: 200,
      }),
    );

    await expect(mcpRpcClient.globalRpcCall("key-123", "wallet_getCallsStatus", ["0xabc"])).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.g.example.com/v2/key-123");
  });

  it("maps JSON-RPC errors to RpcApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad params" } }), {
        status: 200,
      }),
    );

    await expect(mcpRpcClient.networkRpcCall("eth-mainnet", "key-123", "eth_getBalance", [])).rejects.toMatchObject({
      name: "RpcApiError",
      code: -32602,
      message: "bad params",
    });
  });

  it("maps HTTP failures to RpcApiError with response body text", async () => {
    fetchMock.mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    await expect(mcpRpcClient.networkRpcCall("eth-mainnet", "key-123", "eth_blockNumber", [])).rejects.toMatchObject({
      name: "RpcApiError",
      code: 429,
      message: "rate limited",
    });
  });

  it("rejects unsafe network identifiers before fetch", async () => {
    expect(() => validateNetwork("https://evil.example")).toThrow(RpcApiError);
    await expect(mcpRpcClient.networkRpcCall("eth-mainnet.evil", "key-123", "eth_blockNumber", [])).rejects.toMatchObject({
      code: -32602,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
