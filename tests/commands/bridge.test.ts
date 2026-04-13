import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ROUTER = "0x2222222222222222222222222222222222222222";
const FROM = "0x1111111111111111111111111111111111111111";

describe("bridge command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("bridge quote includes toChainId and resolves destination token metadata on the destination network", async () => {
    const printJSON = vi.fn();
    const requestQuoteV0 = vi.fn().mockResolvedValue({
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      feePayment: { sponsored: false, tokenAddress: ETH_USDC, maxAmount: 0n },
    });
    const sourceCall = vi.fn();
    const destinationCall = vi.fn().mockResolvedValue({ decimals: 6, symbol: "USDbC" });
    const clientFromFlags = vi.fn((_program: Command, opts?: { forceNetwork?: string }) => ({
      call: opts?.forceNetwork === "base-mainnet" ? destinationCall : sourceCall,
    }));

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({ requestQuoteV0 }) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags,
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

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", BASE_USDC,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
    ], { from: "node" });

    expect(requestQuoteV0).toHaveBeenCalledWith(expect.objectContaining({
      fromToken: NATIVE_TOKEN,
      toToken: BASE_USDC,
      fromAmount: 100000000000000000n,
      toChainId: 8453,
    }));
    expect(clientFromFlags).toHaveBeenCalledWith(expect.any(Command), { forceNetwork: "base-mainnet" });
    expect(destinationCall).toHaveBeenCalledWith("alchemy_getTokenMetadata", [BASE_USDC]);
    expect(sourceCall).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      fromNetwork: "eth-mainnet",
      toNetwork: "base-mainnet",
      toSymbol: "USDbC",
      minimumOutput: "30",
    }));
  });

  it("bridge quote includes both networks in human output", async () => {
    const printKeyValueBox = vi.fn();
    const requestQuoteV0 = vi.fn().mockResolvedValue({
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      feePayment: { sponsored: false, tokenAddress: ETH_USDC, maxAmount: 0n },
    });
    const clientFromFlags = vi.fn((_program: Command, opts?: { forceNetwork?: string }) => ({
      call: vi.fn().mockResolvedValue(
        opts?.forceNetwork === "base-mainnet"
          ? { decimals: 6, symbol: "USDbC" }
          : { decimals: 6, symbol: "USDC" },
      ),
    }));

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({ requestQuoteV0 }) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _done: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox,
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", BASE_USDC,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
    ], { from: "node" });

    expect(printKeyValueBox).toHaveBeenCalledWith(expect.arrayContaining([
      ["Minimum Receive", "30 USDbC"],
      ["From Network", "eth-mainnet"],
      ["To Network", "base-mainnet"],
    ]));
  });

  it("bridge execute signs prepared calls before sending", async () => {
    const printJSON = vi.fn();
    const quote = {
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 99000000000000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      signatureRequest: { type: "personal_sign", data: "bridge", rawPayload: "0x1234" },
      feePayment: { sponsored: false, tokenAddress: ETH_USDC, maxAmount: 0n },
    };
    const signedQuote = {
      type: "user-operation-v070",
      chainId: 1,
      data: {},
      signature: { type: "secp256k1", data: "0xsigned" },
    };
    const requestQuoteV0 = vi.fn().mockResolvedValue(quote);
    const signPreparedCalls = vi.fn().mockResolvedValue(signedQuote);
    const sendPreparedCalls = vi.fn().mockResolvedValue({ id: "call-bridge-1" });
    const sendCalls = vi.fn();
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xbridgetx" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {
          extend: () => ({ requestQuoteV0 }),
          signPreparedCalls,
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
      clientFromFlags: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({ decimals: 18, symbol: "ETH" }),
      })),
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

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "execute",
      "--from", NATIVE_TOKEN,
      "--to", NATIVE_TOKEN,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
    ], { from: "node" });

    expect(requestQuoteV0).toHaveBeenCalledWith(expect.objectContaining({
      fromToken: NATIVE_TOKEN,
      toToken: NATIVE_TOKEN,
      fromAmount: 100000000000000000n,
      toChainId: 8453,
    }));
    expect(signPreparedCalls).toHaveBeenCalledWith(quote);
    expect(sendPreparedCalls).toHaveBeenCalledWith(signedQuote);
    expect(sendCalls).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      status: "success",
      txHash: "0xbridgetx",
      fromNetwork: "eth-mainnet",
      toNetwork: "base-mainnet",
    }));
  });

  it("bridge execute uses raw calls and forwards paymaster capabilities", async () => {
    const printJSON = vi.fn();
    const requestQuoteV0 = vi.fn().mockResolvedValue({
      rawCalls: true,
      calls: [{ to: ROUTER, data: "0x1234" }],
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 99000000000000000n,
        expiry: 123,
      },
    });
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-bridge-raw" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xrawtx" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {
          extend: () => ({ requestQuoteV0 }),
          signPreparedCalls: vi.fn(),
          sendPreparedCalls: vi.fn(),
          sendCalls,
          waitForCallsStatus,
        },
        network: "eth-mainnet",
        address: FROM,
        paymaster: { policyId: "policy-123" },
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(() => ({
        call: vi.fn().mockResolvedValue({ decimals: 18, symbol: "ETH" }),
      })),
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

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "execute",
      "--from", NATIVE_TOKEN,
      "--to", NATIVE_TOKEN,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
    ], { from: "node" });

    expect(sendCalls).toHaveBeenCalledWith({
      calls: [{ to: ROUTER, data: "0x1234" }],
      capabilities: { paymaster: { policyId: "policy-123" } },
    });
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      sponsored: true,
      callId: "call-bridge-raw",
      txHash: "0xrawtx",
    }));
  });

  it("bridge execute signs paymaster permits and refreshes the quote before submission", async () => {
    const printJSON = vi.fn();
    const permitSignature = { type: "secp256k1", data: "0xpermitsig" };
    const permitQuote = {
      rawCalls: false,
      type: "paymaster-permit",
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 99000000000000000n,
        expiry: 123,
      },
      chainId: 1,
      modifiedRequest: {
        account: FROM,
        fromToken: NATIVE_TOKEN,
        toToken: BASE_USDC,
        fromAmount: 100000000000000000n,
        toChainId: 8453,
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
        fromAmount: 100000000000000000n,
        minimumToAmount: 99000000000000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      signatureRequest: {
        type: "personal_sign",
        data: "bridge quote",
        rawPayload: "0x5678",
      },
      feePayment: { sponsored: false, tokenAddress: ETH_USDC, maxAmount: 0n },
    };
    const signedQuote = {
      type: "user-operation-v070",
      chainId: 1,
      data: {},
      signature: { type: "secp256k1", data: "0xsigned" },
    };
    const requestQuoteV0 = vi.fn().mockResolvedValueOnce(permitQuote);
    const signSignatureRequest = vi.fn().mockResolvedValue(permitSignature);
    const prepareCalls = vi.fn().mockResolvedValue(executableQuote);
    const signPreparedCalls = vi.fn().mockResolvedValue(signedQuote);
    const sendPreparedCalls = vi.fn().mockResolvedValue({ id: "call-bridge-permit" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xpermittx" }],
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
      clientFromFlags: vi.fn((_program: Command, opts?: { forceNetwork?: string }) => ({
        call: vi.fn().mockResolvedValue(
          opts?.forceNetwork === "base-mainnet"
            ? { decimals: 6, symbol: "USDbC" }
            : { decimals: 18, symbol: "ETH" },
        ),
      })),
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

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "execute",
      "--from", NATIVE_TOKEN,
      "--to", BASE_USDC,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
    ], { from: "node" });

    expect(signSignatureRequest).toHaveBeenCalledWith(permitQuote.signatureRequest);
    expect(prepareCalls).toHaveBeenCalledWith(expect.objectContaining({
      ...permitQuote.modifiedRequest,
      paymasterPermitSignature: permitSignature,
    }));
    expect(signPreparedCalls).toHaveBeenCalledWith(executableQuote);
    expect(sendPreparedCalls).toHaveBeenCalledWith(signedQuote);
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      txHash: "0xpermittx",
      toSymbol: "USDbC",
    }));
  });

  it("rejects invalid slippage values", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({}) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(() => ({ call: vi.fn() })),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", BASE_USDC,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
      "--slippage", "150",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("passes explicit slippage when provided", async () => {
    const printJSON = vi.fn();
    const requestQuoteV0 = vi.fn().mockResolvedValue({
      rawCalls: false,
      type: "user-operation-v070",
      quote: {
        fromAmount: 100000000000000000n,
        minimumToAmount: 30000000n,
        expiry: 123,
      },
      chainId: 1,
      data: {},
      feePayment: { sponsored: false, tokenAddress: ETH_USDC, maxAmount: 0n },
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({ requestQuoteV0 }) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn((_program: Command, opts?: { forceNetwork?: string }) => ({
        call: vi.fn().mockResolvedValue(
          opts?.forceNetwork === "base-mainnet"
            ? { decimals: 6, symbol: "USDbC" }
            : { decimals: 18, symbol: "ETH" },
        ),
      })),
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

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", BASE_USDC,
      "--amount", "0.1",
      "--to-network", "base-mainnet",
      "--slippage", "1.25",
    ], { from: "node" });

    expect(requestQuoteV0).toHaveBeenCalledWith(expect.objectContaining({
      fromToken: NATIVE_TOKEN,
      toToken: BASE_USDC,
      fromAmount: 100000000000000000n,
      toChainId: 8453,
      slippage: 125n,
    }));
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      slippage: "1.25",
      minimumOutput: "30",
    }));
  });

  it("rejects invalid destination network", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({}) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(() => ({ call: vi.fn() })),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", NATIVE_TOKEN,
      "--amount", "0.1",
      "--to-network", "nonexistent-network",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("rejects same source and destination networks", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { extend: () => ({}) },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(() => ({ call: vi.fn() })),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerBridge } = await import("../../src/commands/bridge.js");
    const program = new Command();
    registerBridge(program);

    await program.parseAsync([
      "node", "test", "bridge", "quote",
      "--from", NATIVE_TOKEN,
      "--to", NATIVE_TOKEN,
      "--amount", "0.1",
      "--to-network", "eth-mainnet",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Source and destination networks must differ for bridge. Use 'alchemy swap' for same-chain token exchanges on eth-mainnet.",
    }));
  });
});
