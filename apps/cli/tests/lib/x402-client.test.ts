import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { X402Client } from "../../src/lib/x402-client.js";
import { CLIError, ErrorCode } from "../../src/lib/errors.js";
import { setFlags } from "../../src/lib/output.js";

const { signSiweMock, createPaymentMock } = vi.hoisted(() => ({
  signSiweMock: vi.fn(),
  createPaymentMock: vi.fn(),
}));

vi.mock("@alchemy/x402", () => ({
  signSiwe: signSiweMock,
  createPayment: createPaymentMock,
}));

vi.mock("../../src/lib/config.js", () => ({
  load: () => ({}),
  save: vi.fn(),
}));

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
  });
}

function textResponse(status: number, body: string, headers?: HeadersInit): Response {
  return new Response(body, { status, headers });
}

describe("X402Client", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.ALCHEMY_X402_BASE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    signSiweMock.mockReset();
    createPaymentMock.mockReset();
    setFlags({});
    process.env.ALCHEMY_X402_BASE_URL = "http://localhost:9988";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    setFlags({});
    if (originalEnv === undefined) delete process.env.ALCHEMY_X402_BASE_URL;
    else process.env.ALCHEMY_X402_BASE_URL = originalEnv;
  });

  it("sends SIWE auth header and returns RPC result", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        jsonrpc: "2.0",
        id: 1,
        result: "0x10",
      }),
    );
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    const result = await client.call("eth_blockNumber");

    expect(result).toBe("0x10");
    expect(signSiweMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "SIWE siwe-token-1",
    );
  });

  it("refreshes SIWE token when MESSAGE_EXPIRED is returned", async () => {
    signSiweMock.mockResolvedValueOnce("stale-token").mockResolvedValueOnce("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(401, "MESSAGE_EXPIRED"))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: "0xabc",
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    const result = await client.call("eth_blockNumber");

    expect(result).toBe("0xabc");
    expect(signSiweMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstAuth = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    const secondAuth = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(firstAuth.Authorization).toBe("SIWE stale-token");
    expect(secondAuth.Authorization).toBe("SIWE fresh-token");
  });

  it("throws AUTH_REQUIRED on non-expired x402 auth failures", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    const fetchMock = vi.fn().mockResolvedValue(textResponse(401, "unauthorized"));
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    await expect(client.call("eth_blockNumber")).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
      message: "x402 authentication failed: unauthorized",
    });
  });

  it("retries with Payment-Signature on 402 with payment-required header", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    createPaymentMock.mockResolvedValue("payment-sig-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(402, "payment required", { "payment-required": "prh-1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: "0x42",
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    const result = await client.call("eth_blockNumber");

    expect(result).toBe("0x42");
    expect(createPaymentMock).toHaveBeenCalledWith({
      privateKey: "0xabc",
      paymentRequiredHeader: "prh-1",
    });
    const retryHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(retryHeaders["Payment-Signature"]).toBe("payment-sig-1");
  });

  it("throws PAYMENT_REQUIRED when 402 has no payment-required header", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    const fetchMock = vi.fn().mockResolvedValue(textResponse(402, "pay me"));
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    await expect(client.call("eth_blockNumber")).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_REQUIRED,
      message: "x402 payment required but no Payment-Required header received.",
    });
  });

  it("maps insufficient_funds payment error with funding guidance", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    createPaymentMock.mockResolvedValue("payment-sig-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse(402, "payment required", { "payment-required": "prh-1" }))
      .mockResolvedValueOnce(
        jsonResponse(402, {
          error: "insufficient funds",
          accepts: [{ network: "eip155:8453", extra: { name: "USDC" } }],
          extensions: {
            paymentError: {
              info: {
                reason: "insufficient_funds",
                message: "wallet has no funds",
                payer: "0xpayer",
              },
            },
          },
        }),
      );
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    try {
      await client.call("eth_blockNumber");
      expect.fail("expected payment error");
    } catch (err) {
      expect(err).toBeInstanceOf(CLIError);
      const cliErr = err as CLIError;
      expect(cliErr.code).toBe(ErrorCode.PAYMENT_REQUIRED);
      expect(cliErr.message).toContain("Insufficient USDC balance on Base");
      expect(cliErr.hint).toContain("Fund wallet 0xpayer");
    }
  });

  it("throws NETWORK_ERROR on timeout", async () => {
    setFlags({ timeout: 1 });
    signSiweMock.mockResolvedValue("siwe-token-1");
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    await expect(client.call("eth_blockNumber")).rejects.toMatchObject({
      code: ErrorCode.NETWORK_ERROR,
      message: "Network error: Request timed out after 1ms",
    });
  });

  it("reuses cached SIWE token across multiple calls", async () => {
    signSiweMock.mockResolvedValue("siwe-token-1");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: "0x10",
        }),
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const client = new X402Client("0xabc", "eth-mainnet");
    await client.call("eth_blockNumber");
    await client.call("eth_chainId");

    expect(signSiweMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
