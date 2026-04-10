import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

const EVM_OPERATION_ID = "call-123";
const EVM_TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SOLANA_SIGNATURE =
  "5555555555555555555555555555555555555555555555555555555555555555555555555555555555555555";

function mockStatusDeps(opts: {
  network: string;
  json?: boolean;
  call?: ReturnType<typeof vi.fn>;
  getCallsStatus?: ReturnType<typeof vi.fn>;
  buildWalletClientError?: unknown;
  printJSON?: ReturnType<typeof vi.fn>;
  printKeyValueBox?: ReturnType<typeof vi.fn>;
  exitWithError?: ReturnType<typeof vi.fn>;
  etherscanTxURL?: ReturnType<typeof vi.fn>;
}) {
  const {
    network,
    json = true,
    call = vi.fn(),
    getCallsStatus = vi.fn(),
    buildWalletClientError,
    printJSON = vi.fn(),
    printKeyValueBox = vi.fn(),
    exitWithError = vi.fn(),
    etherscanTxURL = vi.fn(),
  } = opts;

  const buildWalletClient = vi.fn(() => {
    if (buildWalletClientError) {
      throw buildWalletClientError;
    }
    return {
      client: { getCallsStatus },
    };
  });

  vi.doMock("../../src/lib/smart-wallet.js", () => ({
    buildWalletClient,
  }));
  vi.doMock("../../src/lib/resolve.js", () => ({
    resolveNetwork: () => network,
    clientFromFlags: () => ({ call }),
  }));
  vi.doMock("../../src/lib/output.js", () => ({
    isJSONMode: () => json,
    printJSON,
  }));
  vi.doMock("../../src/lib/ui.js", () => ({
    withSpinner: async (
      _label: string,
      _done: string,
      fn: () => Promise<unknown>,
    ) => fn(),
    printKeyValueBox,
    green: (s: string) => s,
    red: (s: string) => s,
    dim: (s: string) => s,
    successBadge: () => "✓",
    failBadge: () => "✗",
    etherscanTxURL,
  }));
  vi.doMock("../../src/lib/errors.js", async () => ({
    ...(await vi.importActual("../../src/lib/errors.js")),
    exitWithError,
  }));

  return {
    buildWalletClient,
    call,
    getCallsStatus,
    printJSON,
    printKeyValueBox,
    exitWithError,
    etherscanTxURL,
  };
}

async function runStatus(id: string) {
  const { registerStatus } = await import("../../src/commands/status.js");
  const program = new Command();
  registerStatus(program);
  await program.parseAsync(["node", "test", "status", id], { from: "node" });
}

describe("status command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("checks EVM smart wallet call status", async () => {
    const getCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{
        transactionHash: "0xtxhash",
        blockNumber: 19234567n,
        gasUsed: 21000n,
      }],
    });
    const { printJSON, call, exitWithError } = mockStatusDeps({
      network: "eth-mainnet",
      getCallsStatus,
    });

    await runStatus(EVM_OPERATION_ID);

    expect(getCallsStatus).toHaveBeenCalledWith({ id: EVM_OPERATION_ID });
    expect(call).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith({
      kind: "evm_operation",
      id: EVM_OPERATION_ID,
      network: "eth-mainnet",
      status: "confirmed",
      operationStatus: "success",
      txHash: "0xtxhash",
      blockNumber: "19234567",
      gasUsed: "21000",
      error: null,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("returns confirmed raw transaction status from a receipt", async () => {
    const call = vi.fn().mockResolvedValue({
      status: "0x1",
      transactionHash: "0xabc",
      blockNumber: "0x1234",
      gasUsed: "0x5208",
      from: "0xfrom",
      to: "0xto",
    });
    const { printJSON, buildWalletClient } = mockStatusDeps({
      network: "eth-mainnet",
      call,
    });

    await runStatus(EVM_TX_HASH);

    expect(buildWalletClient).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("eth_getTransactionReceipt", [EVM_TX_HASH]);
    expect(printJSON).toHaveBeenCalledWith({
      kind: "evm_transaction",
      id: EVM_TX_HASH,
      network: "eth-mainnet",
      status: "confirmed",
      executionStatus: "success",
      txHash: "0xabc",
      blockNumber: "4660",
      gasUsed: "21000",
      from: "0xfrom",
      to: "0xto",
      error: null,
    });
  });

  it("returns reverted raw transaction status from a receipt", async () => {
    const call = vi.fn().mockResolvedValue({
      status: "0x0",
      transactionHash: EVM_TX_HASH,
      blockNumber: "0x1234",
      gasUsed: "0x5208",
      from: "0xfrom",
      to: "0xto",
    });
    const { printJSON } = mockStatusDeps({
      network: "eth-mainnet",
      call,
    });

    await runStatus(EVM_TX_HASH);

    expect(printJSON).toHaveBeenCalledWith({
      kind: "evm_transaction",
      id: EVM_TX_HASH,
      network: "eth-mainnet",
      status: "failed",
      executionStatus: "reverted",
      txHash: EVM_TX_HASH,
      blockNumber: "4660",
      gasUsed: "21000",
      from: "0xfrom",
      to: "0xto",
      error: null,
    });
  });

  it("returns pending raw transaction status when the receipt is missing", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        hash: EVM_TX_HASH,
        from: "0xfrom",
        to: "0xto",
      });
    const { printJSON } = mockStatusDeps({
      network: "eth-mainnet",
      call,
    });

    await runStatus(EVM_TX_HASH);

    expect(call).toHaveBeenNthCalledWith(1, "eth_getTransactionReceipt", [EVM_TX_HASH]);
    expect(call).toHaveBeenNthCalledWith(2, "eth_getTransactionByHash", [EVM_TX_HASH]);
    expect(printJSON).toHaveBeenCalledWith({
      kind: "evm_transaction",
      id: EVM_TX_HASH,
      network: "eth-mainnet",
      status: "pending",
      executionStatus: "pending",
      txHash: EVM_TX_HASH,
      blockNumber: null,
      gasUsed: null,
      from: "0xfrom",
      to: "0xto",
      error: null,
    });
  });

  it("returns not found when the raw transaction hash is unknown", async () => {
    const call = vi.fn().mockResolvedValue(null);
    const { printJSON } = mockStatusDeps({
      network: "eth-mainnet",
      call,
    });

    await runStatus(EVM_TX_HASH);

    expect(printJSON).toHaveBeenCalledWith({
      kind: "evm_transaction",
      id: EVM_TX_HASH,
      network: "eth-mainnet",
      status: "not_found",
      executionStatus: null,
      txHash: null,
      blockNumber: null,
      gasUsed: null,
      from: null,
      to: null,
      error: null,
    });
  });

  it("does not silently fall back when operation lookup requires wallet configuration", async () => {
    const { errWalletKeyRequired } = await vi.importActual(
      "../../src/lib/errors.js",
    ) as typeof import("../../src/lib/errors.js");
    const call = vi.fn();
    const { exitWithError, buildWalletClient } = mockStatusDeps({
      network: "eth-mainnet",
      call,
      buildWalletClientError: errWalletKeyRequired(),
    });

    await runStatus(EVM_OPERATION_ID);

    expect(buildWalletClient).toHaveBeenCalledTimes(1);
    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0]?.[0]).toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });

  it("checks Solana transaction status with real signature validation", async () => {
    const call = vi.fn().mockResolvedValue({
      value: [{
        confirmationStatus: "finalized",
        slot: 123456,
        err: null,
      }],
    });
    const { printJSON, exitWithError } = mockStatusDeps({
      network: "solana-devnet",
      call,
    });

    await runStatus(SOLANA_SIGNATURE);

    expect(call).toHaveBeenCalledWith("getSignatureStatuses", [
      [SOLANA_SIGNATURE],
      { searchTransactionHistory: true },
    ]);
    expect(printJSON).toHaveBeenCalledWith({
      kind: "solana_signature",
      id: SOLANA_SIGNATURE,
      network: "solana-devnet",
      status: "confirmed",
      confirmationStatus: "finalized",
      slot: "123456",
      error: null,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("rejects an invalid Solana signature before making an RPC call", async () => {
    const call = vi.fn();
    const { exitWithError } = mockStatusDeps({
      network: "solana-devnet",
      call,
    });

    await runStatus("shortsig");

    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0]?.[0]).toMatchObject({
      code: "INVALID_ARGS",
    });
  });

  it("hints when a Solana signature is used on an EVM network", async () => {
    const call = vi.fn();
    const { exitWithError, buildWalletClient } = mockStatusDeps({
      network: "eth-mainnet",
      call,
    });

    await runStatus(SOLANA_SIGNATURE);

    expect(buildWalletClient).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0]?.[0]).toMatchObject({
      code: "INVALID_ARGS",
      message: expect.stringContaining(
        "looks like a Solana transaction signature",
      ),
    });
  });

  it("renders human-friendly pending operation status", async () => {
    const getCallsStatus = vi.fn().mockResolvedValue({
      status: "queued",
      receipts: [],
    });
    const { printKeyValueBox } = mockStatusDeps({
      network: "eth-mainnet",
      json: false,
      getCallsStatus,
    });

    await runStatus(EVM_OPERATION_ID);

    expect(printKeyValueBox).toHaveBeenCalledWith(
      expect.arrayContaining([
        ["Call ID", EVM_OPERATION_ID],
        ["Network", "eth-mainnet"],
        ["Status", "Pending (queued)"],
      ]),
    );
  });

  it("renders formatted EVM transaction details in human output", async () => {
    const call = vi.fn().mockResolvedValue({
      status: "0x1",
      transactionHash: "0xabc",
      blockNumber: "0x1234",
      gasUsed: "0x5208",
      from: "0xfrom",
      to: "0xto",
    });
    const etherscanTxURL = vi.fn().mockReturnValue("https://etherscan.io/tx/0xabc");
    const { printKeyValueBox } = mockStatusDeps({
      network: "eth-mainnet",
      json: false,
      call,
      etherscanTxURL,
    });

    await runStatus(EVM_TX_HASH);

    expect(etherscanTxURL).toHaveBeenCalledWith("0xabc", "eth-mainnet");
    expect(printKeyValueBox).toHaveBeenCalledWith(
      expect.arrayContaining([
        ["Tx Hash", "0xabc"],
        ["Network", "eth-mainnet"],
        ["Status", "✓ Confirmed"],
        ["Block", "4,660"],
        ["Gas Used", "21,000"],
        ["From", "0xfrom"],
        ["To", "0xto"],
        ["Explorer", "https://etherscan.io/tx/0xabc"],
      ]),
    );
  });

  it("shows slot 0 in human Solana output", async () => {
    const call = vi.fn().mockResolvedValue({
      value: [{
        confirmationStatus: "confirmed",
        slot: 0,
        err: null,
      }],
    });
    const { printKeyValueBox } = mockStatusDeps({
      network: "solana-devnet",
      json: false,
      call,
    });

    await runStatus(SOLANA_SIGNATURE);

    expect(printKeyValueBox).toHaveBeenCalledWith(
      expect.arrayContaining([
        ["Signature", SOLANA_SIGNATURE],
        ["Network", "solana-devnet"],
        ["Status", "✓ Confirmed"],
        ["Slot", "0"],
      ]),
    );
  });
});
