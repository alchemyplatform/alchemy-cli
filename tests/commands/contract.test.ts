import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { ErrorCode } from "../../src/lib/errors.js";

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HOLDER = "0x0000000000000000000000000000000000000001";
const ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;
const ABI_JSON = JSON.stringify(ABI);
const ABI_ARTIFACT_JSON = JSON.stringify({ abi: ABI, bytecode: "0x1234" });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.doUnmock("viem");
  vi.doUnmock("node:fs");
});

function mockUI() {
  const printKeyValueBox = vi.fn();
  vi.doMock("../../src/lib/ui.js", () => ({
    withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
    printKeyValueBox,
    green: (value: string) => value,
    dim: (value: string) => value,
  }));
  return { printKeyValueBox };
}

async function buildProgram() {
  const { registerContract } = await import("../../src/commands/contract.js");
  const program = new Command();
  registerContract(program);
  return program;
}

describe("registerContract", () => {
  it("reads with inline ABI artifacts, preserves structured JSON results, and honors --block", async () => {
    const call = vi.fn().mockResolvedValue("0xraw");
    const resolveAddress = vi.fn().mockResolvedValue(ADDRESS);
    const printJSON = vi.fn();
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");
    const decodeFunctionResult = vi.fn().mockReturnValue({
      amount: 12n,
      nested: [1n, { ok: true, total: 3n }],
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    mockUI();
    vi.doMock("viem", async () => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      return {
        ...actual,
        encodeFunctionData,
        decodeFunctionResult,
      };
    });

    const program = await buildProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "contract",
        "read",
        ADDRESS,
        "balanceOf",
        "--abi",
        ABI_ARTIFACT_JSON,
        "--args",
        `["${HOLDER}"]`,
        "--block",
        "123",
      ],
      { from: "node" },
    );

    expect(encodeFunctionData).toHaveBeenCalledWith({
      abi: ABI,
      functionName: "balanceOf",
      args: [HOLDER],
    });
    expect(call).toHaveBeenCalledWith("eth_call", [{ to: ADDRESS, data: "0xencoded" }, "0x7b"]);
    expect(printJSON).toHaveBeenCalledWith({
      contract: ADDRESS,
      function: "balanceOf",
      network: "eth-mainnet",
      block: "123",
      result: {
        amount: "12",
        nested: ["1", { ok: true, total: "3" }],
      },
      raw: "0xraw",
    });
  });

  it("reads with --abi-file and accepts nested tuple signatures", async () => {
    const call = vi.fn().mockResolvedValue("0xraw");
    const resolveAddress = vi.fn().mockResolvedValue(ADDRESS);
    const printJSON = vi.fn();
    const readFileSync = vi.fn().mockReturnValue(ABI_ARTIFACT_JSON);
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");
    const decodeFunctionResult = vi.fn().mockReturnValue(42n);

    vi.doMock("node:fs", () => ({ readFileSync }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    mockUI();
    vi.doMock("viem", async () => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      return {
        ...actual,
        encodeFunctionData,
        decodeFunctionResult,
      };
    });

    const program = await buildProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "contract",
        "read",
        ADDRESS,
        "quote((address,uint256))(uint256)",
        "--args",
        `[[\"${HOLDER}\",\"1000000\"]]`,
      ],
      { from: "node" },
    );

    expect(encodeFunctionData).toHaveBeenCalledWith({
      abi: expect.any(Array),
      functionName: "quote",
      args: [[HOLDER, "1000000"]],
    });

    const abiFileProgram = await buildProgram();
    await abiFileProgram.parseAsync(
      [
        "node",
        "test",
        "contract",
        "read",
        ADDRESS,
        "balanceOf",
        "--abi-file",
        "./erc20.json",
        "--args",
        `["${HOLDER}"]`,
      ],
      { from: "node" },
    );

    expect(readFileSync).toHaveBeenCalledWith("./erc20.json", "utf-8");
    expect(printJSON).toHaveBeenLastCalledWith({
      contract: ADDRESS,
      function: "balanceOf",
      network: "eth-mainnet",
      block: "latest",
      result: "42",
      raw: "0xraw",
    });
  });

  it("calls a contract with sponsorship and a parsed ETH value", async () => {
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash" }],
    });
    const resolveAddress = vi.fn().mockResolvedValue(ADDRESS);
    const readFileSync = vi.fn().mockReturnValue(ABI_ARTIFACT_JSON);
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");
    const { printKeyValueBox } = mockUI();

    vi.doMock("node:fs", () => ({ readFileSync }));
    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "base-mainnet",
        address: "0xfrom",
        paymaster: { policyId: "policy-123" },
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ rpc: true }),
      resolveNetwork: () => "base-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    vi.doMock("viem", async () => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      return {
        ...actual,
        encodeFunctionData,
      };
    });

    const program = await buildProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "contract",
        "call",
        ADDRESS,
        "deposit",
        "--abi-file",
        "./contract.json",
        "--value",
        ".5",
      ],
      { from: "node" },
    );

    expect(sendCalls).toHaveBeenCalledWith({
      calls: [{ to: ADDRESS, data: "0xencoded", value: 500000000000000000n }],
      capabilities: { paymaster: { policyId: "policy-123" } },
    });
    expect(printKeyValueBox).toHaveBeenCalledWith(expect.arrayContaining([
      ["Gas", "Sponsored"],
      ["Tx Hash", "0xtxhash"],
      ["Status", "Confirmed"],
    ]));
  });
});

describe("performContractCall", () => {
  it.each(["1.2.3", "-1"])("rejects invalid ETH values: %s", async (value) => {
    const sendCalls = vi.fn();
    const waitForCallsStatus = vi.fn();
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: "0xfrom",
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ rpc: true }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress: async () => ADDRESS,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    mockUI();
    vi.doMock("viem", async () => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      return {
        ...actual,
        encodeFunctionData,
      };
    });

    const { performContractCall } = await import("../../src/commands/contract.js");
    await expect(
      performContractCall({} as Command, ADDRESS, "deposit", { abi: ABI_JSON, value }),
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGS,
    });
    expect(sendCalls).not.toHaveBeenCalled();
  });

  it("throws on reverted write status with RPC error data", async () => {
    const sendCalls = vi.fn().mockResolvedValue({ id: "call-456" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "reverted",
      receipts: [{ transactionHash: "0xdeadbeef" }],
    });
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: "0xfrom",
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ rpc: true }),
      resolveNetwork: () => "eth-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress: async () => ADDRESS,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    mockUI();
    vi.doMock("viem", async () => {
      const actual = await vi.importActual<typeof import("viem")>("viem");
      return {
        ...actual,
        encodeFunctionData,
      };
    });

    const { performContractCall } = await import("../../src/commands/contract.js");
    await expect(
      performContractCall({} as Command, ADDRESS, "deposit", { abi: ABI_JSON }),
    ).rejects.toMatchObject({
      code: ErrorCode.RPC_ERROR,
      message: 'Contract call failed with status "reverted".',
      data: {
        callId: "call-456",
        status: "reverted",
        txHash: "0xdeadbeef",
      },
    });
  });
});
