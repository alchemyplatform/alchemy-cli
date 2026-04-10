import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { decodeFunctionData, erc20Abi, maxUint256 } from "viem";

const TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const SPENDER = "0x1111111111111111111111111111111111111111";
const FROM = "0x2222222222222222222222222222222222222222";

function encodeUint256Result(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function mockRpcClient(currentAllowance = 0n) {
  return {
    call: vi.fn().mockImplementation((method: string) => {
      if (method === "alchemy_getTokenMetadata") {
        return Promise.resolve({ decimals: 6, symbol: "USDC" });
      }
      if (method === "eth_call") {
        return Promise.resolve(encodeUint256Result(currentAllowance));
      }
      return Promise.reject(new Error(`Unexpected method: ${method}`));
    }),
  };
}

describe("approve command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("approves an explicit amount, includes allowance context, and encodes approve calldata", async () => {
    const printJSON = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash" }],
    });
    const rpcClient = mockRpcClient(0n);

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => rpcClient,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--amount", "100",
    ], { from: "node" });

    const sentCall = sendCalls.mock.calls[0]?.[0]?.calls?.[0];
    const decoded = decodeFunctionData({ abi: erc20Abi, data: sentCall.data });

    expect(sentCall).toEqual(expect.objectContaining({ to: TOKEN }));
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([SPENDER, 100000000n]);
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      token: TOKEN,
      spender: SPENDER,
      approvalType: "exact",
      inputAmount: "100",
      requestedAllowanceRaw: "100000000",
      currentAllowanceRaw: "0",
      currentAllowanceDisplay: "0 USDC",
      resetFirst: false,
      status: "success",
      txHash: "0xtxhash",
    }));
  });

  it("requires --reset-first when replacing a non-zero allowance with a different non-zero value", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(50000000n),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--amount", "100",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: expect.stringContaining("Re-run with --reset-first"),
    }));
  });

  it("requires an explicit confirmation bypass for unlimited approval in non-interactive mode", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--unlimited",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Unlimited approval requires confirmation. Re-run with --yes to confirm.",
    }));
  });

  it("submits unlimited approval when explicitly requested", async () => {
    const printJSON = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-456" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtx2" }],
    });
    const rpcClient = mockRpcClient(0n);

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => rpcClient,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--unlimited",
      "--yes",
    ], { from: "node" });

    const sentCall = sendCalls.mock.calls[0]?.[0]?.calls?.[0];
    const decoded = decodeFunctionData({ abi: erc20Abi, data: sentCall.data });

    expect(decoded.args).toEqual([SPENDER, maxUint256]);
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      approvalType: "unlimited",
      inputAmount: null,
      requestedAllowanceRaw: maxUint256.toString(),
      currentAllowanceRaw: "0",
      resetFirst: false,
    }));
  });

  it("prompts before unlimited approval in interactive mode and submits when confirmed", async () => {
    const printKeyValueBox = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-interactive" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtx-interactive" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(0n),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptConfirm: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox,
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerApprove } = await import("../../src/commands/approve.js");
    const { promptConfirm } = await import("../../src/lib/terminal-ui.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--unlimited",
    ], { from: "node" });

    expect(promptConfirm).toHaveBeenCalledWith(expect.objectContaining({
      message: `Grant unlimited USDC allowance to ${SPENDER}?`,
      initialValue: false,
    }));
    const sentCall = sendCalls.mock.calls[0]?.[0]?.calls?.[0];
    const decoded = decodeFunctionData({ abi: erc20Abi, data: sentCall.data });
    expect(decoded.args).toEqual([SPENDER, maxUint256]);
    expect(printKeyValueBox).toHaveBeenCalledWith(expect.arrayContaining([
      ["Current Allowance", "0 USDC"],
      ["Requested Allowance", "Unlimited USDC"],
      ["Status", "Confirmed"],
    ]));
  });

  it("skips unlimited approval when the interactive confirmation is declined", async () => {
    const printKeyValueBox = vi.fn();
    const sendCalls = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus: vi.fn() },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(0n),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptConfirm: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox,
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--unlimited",
    ], { from: "node" });

    expect(sendCalls).not.toHaveBeenCalled();
    expect(printKeyValueBox).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("uses a zero-then-approve sequence when --reset-first is requested", async () => {
    const printJSON = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-457" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtx-reset" }],
    });
    const rpcClient = mockRpcClient(50000000n);

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => rpcClient,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--amount", "100",
      "--reset-first",
    ], { from: "node" });

    const sentCalls = sendCalls.mock.calls[0]?.[0]?.calls;
    expect(sentCalls).toHaveLength(2);

    const first = decodeFunctionData({ abi: erc20Abi, data: sentCalls[0].data });
    const second = decodeFunctionData({ abi: erc20Abi, data: sentCalls[1].data });

    expect(first.args).toEqual([SPENDER, 0n]);
    expect(second.args).toEqual([SPENDER, 100000000n]);
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      approvalType: "exact",
      resetFirst: true,
      requestedAllowanceRaw: "100000000",
      currentAllowanceRaw: "50000000",
    }));
  });

  it("revokes approval with --revoke and encodes zero allowance", async () => {
    const printJSON = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-789" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtx3" }],
    });
    const rpcClient = mockRpcClient(25000000n);

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => rpcClient,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateAddress: vi.fn(),
    }));

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--revoke",
    ], { from: "node" });

    const sentCall = sendCalls.mock.calls[0]?.[0]?.calls?.[0];
    const decoded = decodeFunctionData({ abi: erc20Abi, data: sentCall.data });

    expect(decoded.args).toEqual([SPENDER, 0n]);
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      approvalType: "revoke",
      requestedAllowanceRaw: "0",
      currentAllowanceRaw: "25000000",
      resetFirst: false,
    }));
  });

  it("fails with an RPC error when the approval transaction status is not success", async () => {
    const exitWithError = vi.fn();
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-fail" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "reverted",
      receipts: [{ transactionHash: "0xtx-fail" }],
    });

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(0n),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_l: string, _d: string, fn: () => Promise<unknown>) => fn(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--amount", "100",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "RPC_ERROR",
      message: 'Approval failed with status "reverted".',
      data: expect.objectContaining({
        callId: "call-fail",
        status: "reverted",
        txHash: "0xtx-fail",
      }),
    }));
  });

  it("rejects missing approval mode flags", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Provide exactly one of --amount, --unlimited, or --revoke.",
    }));
  });

  it("rejects combining approval modes", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--amount", "100",
      "--revoke",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Provide exactly one of --amount, --unlimited, or --revoke.",
    }));
  });

  it("rejects --reset-first with --revoke", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", TOKEN,
      "--spender", SPENDER,
      "--revoke",
      "--reset-first",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Do not use --reset-first with --revoke. Revoking already sets allowance to 0.",
    }));
  });

  it("rejects the native token sentinel", async () => {
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: {},
        network: "eth-mainnet",
        address: FROM,
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => mockRpcClient(),
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

    const { registerApprove } = await import("../../src/commands/approve.js");
    const program = new Command();
    registerApprove(program);

    await program.parseAsync([
      "node", "test", "approve", NATIVE_TOKEN,
      "--spender", SPENDER,
      "--amount", "1",
    ], { from: "node" });

    expect(exitWithError).toHaveBeenCalledWith(expect.objectContaining({
      code: "INVALID_ARGS",
      message: "Native tokens do not support ERC-20 approvals. Provide an ERC-20 token contract address.",
    }));
  });
});
