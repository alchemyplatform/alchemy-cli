import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { ErrorCode } from "../../src/lib/errors.js";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe("parseAmount", () => {
  it("parses whole number with 18 decimals", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1", 18)).toBe(1000000000000000000n);
  });

  it("parses decimal amount with 18 decimals", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1.5", 18)).toBe(1500000000000000000n);
  });

  it("parses small fraction with 18 decimals", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("0.001", 18)).toBe(1000000000000000n);
  });

  it("parses whole number with 6 decimals (USDC)", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("100", 6)).toBe(100000000n);
  });

  it("parses decimal with 6 decimals", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1.5", 6)).toBe(1500000n);
  });

  it("parses amount with trailing zeros", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1.50", 18)).toBe(1500000000000000000n);
  });

  it("parses amount with leading decimal", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount(".5", 18)).toBe(500000000000000000n);
  });

  it("rejects negative amounts", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("-1", 18)).toThrow(/positive number/);
  });

  it("rejects zero amount", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("0", 18)).toThrow(/greater than zero/);
  });

  it("rejects empty string", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("", 18)).toThrow(/required/);
  });

  it("rejects too many decimal places", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("1.1234567", 6)).toThrow(/Too many decimal places/);
  });

  it("rejects non-numeric input", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("abc", 18)).toThrow(/Invalid amount/);
  });

  it("rejects multiple dots", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(() => parseAmount("1.2.3", 18)).toThrow(/Invalid amount/);
  });

  it("handles large amounts", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1000000", 18)).toBe(1000000000000000000000000n);
  });

  it("handles max decimal places exactly", async () => {
    const { parseAmount } = await import("../../src/lib/token-amounts.js");
    expect(parseAmount("1.123456", 6)).toBe(1123456n);
  });
});

describe("registerEvmSend", () => {
  it("registers a dry-run preview option", async () => {
    const { registerEvmSend } = await import("../../src/commands/send-evm.js");
    const program = new Command();
    registerEvmSend(program);
    const sendCommand = program.commands.find((command) => command.name() === "send");

    expect(sendCommand?.options.some((option) => option.flags.includes("--dry-run"))).toBe(true);
  });

  it("rejects invalid --signer values", async () => {
    const { registerEvmSend } = await import("../../src/commands/send-evm.js");
    const program = new Command();
    program.exitOverride();
    registerEvmSend(program);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
      throw new Error("exit called");
    }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      program.parseAsync(
        ["node", "test", "send", "0xabc", "1.5", "--signer", "garbage"],
        { from: "node" },
      ),
    ).rejects.toBeTruthy();

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("performEvmSend", () => {
  it("sends a native EVM transfer and prints JSON output", async () => {
    vi.doUnmock("../../src/commands/send-evm.js");

    const sendCalls = vi.fn().mockResolvedValue({ id: "call-123" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash" }],
    });
    const printJSON = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      ensureGasPolicyResolved: vi.fn().mockResolvedValue(undefined),
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: "0xfrom",
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ rpc: true }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress: async () => "0xto",
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "ETH",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("viem", () => ({
      encodeFunctionData: vi.fn(),
      erc20Abi: [],
    }));

    const { performEvmSend } = await import("../../src/commands/send-evm.js");
    await performEvmSend({} as Command, "vitalik.eth", "1.5");

    expect(sendCalls).toHaveBeenCalledWith({
      calls: [{ to: "0xto", value: 1500000000000000000n }],
      capabilities: undefined,
    });
    expect(printJSON).toHaveBeenCalledWith({
      from: "0xfrom",
      to: "0xto",
      amount: "1.5",
      token: "ETH",
      network: "eth-mainnet",
      sponsored: false,
      txHash: "0xtxhash",
      callId: "call-123",
      status: "success",
    });
  });

  it("previews a native EVM transfer without signing or sending", async () => {
    vi.doUnmock("../../src/commands/send-evm.js");

    const sendCalls = vi.fn();
    const waitForCallsStatus = vi.fn();
    const printJSON = vi.fn();

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      ensureGasPolicyResolved: vi.fn().mockResolvedValue(undefined),
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "eth-mainnet",
        address: "0xfrom",
        paymaster: undefined,
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ rpc: true }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress: async () => "0xto",
      validateAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "ETH",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("viem", () => ({
      encodeFunctionData: vi.fn(),
      erc20Abi: [],
    }));

    const { performEvmSend } = await import("../../src/commands/send-evm.js");
    await performEvmSend({} as Command, "vitalik.eth", "1.5", undefined, {
      dryRun: true,
    });

    expect(sendCalls).not.toHaveBeenCalled();
    expect(waitForCallsStatus).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "evm-send",
      from: "0xfrom",
      to: "0xto",
      amount: "1.5",
      token: "ETH",
      tokenAddress: null,
      network: "eth-mainnet",
      sponsored: false,
      calls: [{ to: "0xto", value: "1500000000000000000" }],
    });
  });

  it("sends an ERC-20 transfer with sponsorship", async () => {
    vi.doUnmock("../../src/commands/send-evm.js");

    const sendCalls = vi.fn().mockResolvedValue({ id: "call-456" });
    const waitForCallsStatus = vi.fn().mockResolvedValue({
      status: "success",
      receipts: [{ transactionHash: "0xtxhash2" }],
    });
    const validateAddress = vi.fn();
    const encodeFunctionData = vi.fn().mockReturnValue("0xencoded");

    vi.doMock("../../src/lib/smart-wallet.js", () => ({
      ensureGasPolicyResolved: vi.fn().mockResolvedValue(undefined),
      buildWalletClient: () => ({
        client: { sendCalls, waitForCallsStatus },
        network: "base-mainnet",
        address: "0xfrom",
        paymaster: { policyId: "policy-123" },
      }),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({
        call: vi.fn().mockResolvedValue({ decimals: 6, symbol: "USDC" }),
      }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      resolveAddress: async () => "0xto",
      validateAddress,
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "ETH",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
    }));
    const printKeyValueBox = vi.fn();
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: printKeyValueBox,
      printKeyValueBox,
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("viem", () => ({
      encodeFunctionData,
      erc20Abi: ["mock-abi"],
    }));

    const { performEvmSend } = await import("../../src/commands/send-evm.js");
    await performEvmSend({} as Command, "0xto", "1.5", "0xtoken");

    expect(validateAddress).toHaveBeenCalledWith("0xtoken");
    expect(encodeFunctionData).toHaveBeenCalled();
    expect(sendCalls).toHaveBeenCalledWith({
      calls: [{ to: "0xtoken", data: "0xencoded" }],
      capabilities: { paymaster: { policyId: "policy-123" } },
    });
    expect(printKeyValueBox).toHaveBeenCalledWith(expect.arrayContaining([
      ["Call ID", "call-456"],
      ["Gas", "Sponsored"],
      ["Tx Hash", "0xtxhash2"],
    ]));
  });
});

describe("performSolanaSend", () => {
  it("accepts explicit fee sponsorship flags", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    const buildAndSendSolanaTransaction = vi.fn().mockResolvedValue({
      signature: "sponsored-sol-sig",
      fromAddress: "SoFromAddr",
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: (cmd: Command) => Boolean(cmd.opts<{ feeSponsored?: boolean }>().feeSponsored),
      resolveSolanaFeePolicyId: (cmd: Command) => cmd.opts<{ feePolicyId?: string }>().feePolicyId,
      clientFromFlags: vi.fn((_program, opts) => ({
        network: opts?.forceNetwork ?? "unexpected-network",
      })),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: () => Uint8Array.from({ length: 64 }, (_, i) => i),
      createSolanaSignerFromKeyBytes: async () => ({ address: "SoSignerAddr" }),
      buildSolTransferInstruction: vi.fn().mockReturnValue({ kind: "transfer-ix" }),
      buildAndSendSolanaTransaction,
      waitForSolanaConfirmation: vi.fn().mockResolvedValue(true),
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { registerSolanaSend } = await import("../../src/commands/send-solana.js");
    const program = new Command();
    registerSolanaSend(program);

    await program.parseAsync([
      "node",
      "test",
      "send",
      "SoRecipientAddr",
      "0.5",
      "--fee-sponsored",
      "--fee-policy-id",
      "policy-id",
    ], { from: "node" });

    expect(buildAndSendSolanaTransaction).toHaveBeenCalledWith(expect.objectContaining({
      sponsored: true,
      gasPolicyId: "policy-id",
    }));
  });

  it("sends a native SOL transfer and prints JSON output", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    const printJSON = vi.fn();
    const buildSolTransferInstruction = vi.fn().mockReturnValue({ kind: "transfer-ix" });
    const buildAndSendSolanaTransaction = vi.fn().mockResolvedValue({
      signature: "sol-sig",
      fromAddress: "SoFromAddr",
    });
    const waitForSolanaConfirmation = vi.fn().mockResolvedValue(true);
    const validateSolanaAddress = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => false,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: vi.fn((_program, opts) => ({
        network: opts?.forceNetwork ?? "unexpected-network",
      })),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress,
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: () => Uint8Array.from({ length: 64 }, (_, i) => i),
      createSolanaSignerFromKeyBytes: async () => ({ address: "SoSignerAddr" }),
      buildSolTransferInstruction,
      buildAndSendSolanaTransaction,
      waitForSolanaConfirmation,
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
      createKeyPairSignerFromBytes: async () => ({ address: "SoSignerAddr" }),
      createKeyPairSignerFromPrivateKeyBytes: async () => ({ address: "SoSignerAddr" }),
    }));

    const { performSolanaSend } = await import("../../src/commands/send-solana.js");
    await performSolanaSend({} as Command, "SoRecipientAddr", "0.5");

    expect(validateSolanaAddress).toHaveBeenCalledWith("SoRecipientAddr");
    expect(buildSolTransferInstruction).toHaveBeenCalledWith(
      { address: "SoSignerAddr" },
      "SoRecipientAddr",
      500000000n,
    );
    expect(buildAndSendSolanaTransaction).toHaveBeenCalledWith({
      client: { network: "solana-devnet" },
      instructions: [{ kind: "transfer-ix" }],
      senderKeyBytes: Uint8Array.from({ length: 64 }, (_, i) => i),
      sponsored: false,
      gasPolicyId: undefined,
    });
    expect(printJSON).toHaveBeenCalledWith({
      from: "SoFromAddr",
      to: "SoRecipientAddr",
      amount: "0.5",
      token: "SOL",
      network: "solana-devnet",
      sponsored: false,
      signature: "sol-sig",
      status: "confirmed",
    });
  });

  it("rejects SPL token transfers for now", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => false,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: () => ({ network: "solana-devnet" }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: vi.fn(),
      createSolanaSignerFromKeyBytes: vi.fn(),
      buildSolTransferInstruction: vi.fn(),
      buildAndSendSolanaTransaction: vi.fn(),
      waitForSolanaConfirmation: vi.fn(),
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { performSolanaSend } = await import("../../src/commands/send-solana.js");
    await expect(performSolanaSend({} as Command, "SoRecipientAddr", "0.5", "SomeMint")).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGS,
    });
  });

  it("throws the Solana-specific missing-wallet error", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => undefined,
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => false,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: () => ({ network: "solana-devnet" }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: vi.fn(),
      createSolanaSignerFromKeyBytes: vi.fn(),
      buildSolTransferInstruction: vi.fn(),
      buildAndSendSolanaTransaction: vi.fn(),
      waitForSolanaConfirmation: vi.fn(),
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { performSolanaSend } = await import("../../src/commands/send-solana.js");
    await expect(performSolanaSend({} as Command, "SoRecipientAddr", "0.5")).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
      message: expect.stringContaining("Solana wallet key required"),
    });
  });

  it("rejects --signer session because session wallet does not support Solana", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => false,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: () => ({ network: "solana-devnet" }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: vi.fn(),
      createSolanaSignerFromKeyBytes: vi.fn(),
      buildSolTransferInstruction: vi.fn(),
      buildAndSendSolanaTransaction: vi.fn(),
      waitForSolanaConfirmation: vi.fn(),
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (v: string) => v,
    }));

    const { performSolanaSend } = await import("../../src/commands/send-solana.js");
    await expect(
      performSolanaSend({} as Command, "SoRecipientAddr", "0.5", undefined, { signer: "session" }),
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGS,
      message: expect.stringContaining("session wallet does not yet support Solana"),
    });
  });

  it("requires a fee policy id for sponsored Solana sends", async () => {
    vi.doUnmock("../../src/commands/send-solana.js");

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveNetwork: () => "solana-devnet",
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => true,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => true,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: () => ({ network: "solana-devnet" }),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      nativeTokenSymbol: () => "SOL",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: vi.fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      green: (s: string) => s,
      successBadge: () => "✓",
    }));
    vi.doMock("../../src/lib/solana-tx.js", () => ({
      parseSolanaKeyBytes: () => Uint8Array.from({ length: 64 }, (_, i) => i),
      createSolanaSignerFromKeyBytes: async () => ({ address: "SoSignerAddr" }),
      buildSolTransferInstruction: vi.fn(),
      buildAndSendSolanaTransaction: vi.fn(),
      waitForSolanaConfirmation: vi.fn(),
      SOL_DECIMALS: 9,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
      createKeyPairSignerFromBytes: async () => ({ address: "SoSignerAddr" }),
      createKeyPairSignerFromPrivateKeyBytes: async () => ({ address: "SoSignerAddr" }),
    }));

    const { performSolanaSend } = await import("../../src/commands/send-solana.js");
    await expect(performSolanaSend({} as Command, "SoRecipientAddr", "0.5")).rejects.toMatchObject({
      code: ErrorCode.INVALID_ARGS,
      message: expect.stringContaining("Fee sponsorship requires a policy ID"),
    });
  });
});
