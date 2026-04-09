import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const FROM = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x2222222222222222222222222222222222222222";

describe("swap command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("swap quote uses minimum output from the SDK quote and native network symbols", async () => {
    const printJSON = vi.fn();
    const requestQuoteV0 = vi.fn().mockResolvedValue({
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 1000000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 137,
      data: {},
      feePayment: {
        sponsored: false,
        tokenAddress: USDC,
        maxAmount: 0n,
      },
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {
          extend: () => ({ requestQuoteV0 }),
        },
        network: "polygon-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({
        call: vi.fn().mockResolvedValue({ decimals: 6, symbol: "USDC" }),
      }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _done: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerSwap } = await import("../../src/commands/swap.js");
    const program = new Command();
    registerSwap(program);

    await program.parseAsync([
      "node", "test", "swap", "quote",
      "--from", NATIVE_TOKEN,
      "--to", USDC,
      "--amount", "1.0",
    ], { from: "node" });

    expect(requestQuoteV0).toHaveBeenCalledWith(expect.objectContaining({
      fromToken: NATIVE_TOKEN,
      toToken: USDC,
      fromAmount: 1000000000000000000n,
      slippage: 50n,
    }));

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      fromToken: NATIVE_TOKEN,
      toToken: USDC,
      fromAmount: "1.0",
      fromSymbol: "POL",
      toSymbol: "USDC",
      expectedOutput: "30",
      network: "polygon-mainnet",
      quoteType: "user-operation-v070",
    }));
  });

  it("swap execute signs prepared calls before sending", async () => {
    const printJSON = vi.fn();
    const quote = {
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 1000000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      signatureRequest: {
        type: "personal_sign",
        data: "swap quote",
        rawPayload: "0x1234",
      },
      feePayment: {
        sponsored: false,
        tokenAddress: USDC,
        maxAmount: 0n,
      },
    };
    const signedQuote = {
      type: "user-operation-v070",
      chainId: 1,
      data: {},
      signature: { type: "secp256k1", data: "0xsigned" },
    };
    const requestQuoteV0 = vi.fn().mockResolvedValue(quote);
    const signPreparedCalls = vi.fn().mockResolvedValue(signedQuote);
    const signSignatureRequest = vi.fn();
    const sendPreparedCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {
          extend: () => ({ requestQuoteV0 }),
          signPreparedCalls,
          signSignatureRequest,
          sendPreparedCalls,
          sendCalls,
          waitForCallsStatus,
        },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({
        call: vi.fn().mockResolvedValue({ decimals: 6, symbol: "USDC" }),
      }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _done: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerSwap } = await import("../../src/commands/swap.js");
    const program = new Command();
    registerSwap(program);

    await program.parseAsync([
      "node", "test", "swap", "execute",
      "--from", NATIVE_TOKEN,
      "--to", USDC,
      "--amount", "1.0",
    ], { from: "node" });

    expect(requestQuoteV0).toHaveBeenCalled();
    expect(signPreparedCalls).toHaveBeenCalledWith(quote);
    expect(sendPreparedCalls).toHaveBeenCalledWith(signedQuote);
    expect(sendCalls).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      status: "success",
      txHash: "0xtxhash",
    }));
  });

  it("swap execute signs paymaster permits and refreshes the quote before submission", async () => {
    const printJSON = vi.fn();
    const permitSignature = { type: "secp256k1", data: "0xpermitsig" };
    const permitQuote = {
      rawCalls: false,
      type: "paymaster-permit",
      quote: {
        fromAmount: 1000000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      modifiedRequest: {
        account: FROM,
        fromToken: NATIVE_TOKEN,
        toToken: USDC,
        fromAmount: 1000000000000000000n,
        slippage: 50n,
      },
      data: {
        domain: {
          chainId: 1,
          name: "Permit",
          version: "1",
          verifyingContract: ROUTER,
        },
        types: {
          Permit: [{ name: "owner", type: "address" }],
        },
        primaryType: "Permit",
        message: {
          owner: FROM,
        },
      },
      signatureRequest: {
        type: "eth_signTypedData_v4",
        data: {
          domain: {
            chainId: 1,
            name: "Permit",
            version: "1",
            verifyingContract: ROUTER,
          },
          types: {
            Permit: [{ name: "owner", type: "address" }],
          },
          primaryType: "Permit",
          message: {
            owner: FROM,
          },
        },
        rawPayload: "0x1234",
      },
    };
    const executableQuote = {
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 1000000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      signatureRequest: {
        type: "personal_sign",
        data: "swap quote",
        rawPayload: "0x5678",
      },
      feePayment: {
        sponsored: false,
        tokenAddress: USDC,
        maxAmount: 0n,
      },
    };
    const signedQuote = {
      type: "user-operation-v070",
      chainId: 1,
      data: {},
      signature: { type: "secp256k1", data: "0xsigned" },
    };
    const requestQuoteV0 = vi
      .fn()
      .mockResolvedValueOnce(permitQuote);
    const signSignatureRequest = vi.fn().mockResolvedValue(permitSignature);
    const prepareCalls = vi.fn().mockResolvedValue(executableQuote);
    const signPreparedCalls = vi.fn().mockResolvedValue(signedQuote);
    const sendPreparedCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {
          extend: () => ({ requestQuoteV0 }),
          prepareCalls,
          signSignatureRequest,
          signPreparedCalls,
          sendPreparedCalls,
          sendCalls: vi.fn(),
          waitForCallsStatus,
        },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({
        call: vi.fn().mockResolvedValue({ decimals: 6, symbol: "USDC" }),
      }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _done: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerSwap } = await import("../../src/commands/swap.js");
    const program = new Command();
    registerSwap(program);

    await program.parseAsync([
      "node", "test", "swap", "execute",
      "--from", NATIVE_TOKEN,
      "--to", USDC,
      "--amount", "1.0",
    ], { from: "node" });

    expect(signSignatureRequest).toHaveBeenCalledWith(permitQuote.signatureRequest);
    expect(prepareCalls).toHaveBeenCalledWith(expect.objectContaining({
      ...permitQuote.modifiedRequest,
      paymasterPermitSignature: permitSignature,
    }));
    expect(signPreparedCalls).toHaveBeenCalledWith(executableQuote);
    expect(sendPreparedCalls).toHaveBeenCalledWith(signedQuote);
  });

  it("rejects invalid slippage values", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({}) },
        network: "eth-mainnet",
        address: "0xfrom",
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call: vi.fn() }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerSwap } = await import("../../src/commands/swap.js");
    const program = new Command();
    registerSwap(program);

    await program.parseAsync([
      "node", "test", "swap", "quote",
      "--from", NATIVE_TOKEN,
      "--to", USDC,
      "--amount", "1.0",
      "--slippage", "150",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
