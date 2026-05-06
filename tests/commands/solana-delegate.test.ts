import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

const TOKEN_ACCOUNT = "11111111111111111111111111111111";
const MINT = "So11111111111111111111111111111111111111112";
const DELEGATE = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const KEY_BYTES = Uint8Array.from({ length: 64 }, (_, i) => i);
const SIGNER = { address: "SoSigner1111111111111111111111111111111111" };

describe("solana delegate command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("approves an SPL token delegate and prints JSON output", async () => {
    const printJSON = vi.fn();
    const validateSolanaAddress = vi.fn();
    const buildSplTokenApproveCheckedInstruction = vi.fn().mockReturnValue({ kind: "approve-ix" });
    const buildAndSendSolanaTransaction = vi.fn().mockResolvedValue({
      signature: "sol-sig",
      fromAddress: SIGNER.address,
    });
    const waitForSolanaConfirmation = vi.fn().mockResolvedValue(true);

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from(KEY_BYTES)),
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
      parseSolanaKeyBytes: () => KEY_BYTES,
      createSolanaSignerFromKeyBytes: async () => SIGNER,
      buildSplTokenApproveCheckedInstruction,
      buildSplTokenRevokeInstruction: vi.fn(),
      buildAndSendSolanaTransaction,
      waitForSolanaConfirmation,
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { performSolanaDelegateApprove } = await import("../../src/commands/solana-delegate.js");
    await performSolanaDelegateApprove({} as Command, {
      tokenAccount: TOKEN_ACCOUNT,
      mint: MINT,
      delegate: DELEGATE,
      amount: "1.5",
      decimals: "6",
    });

    expect(validateSolanaAddress).toHaveBeenCalledWith(TOKEN_ACCOUNT);
    expect(validateSolanaAddress).toHaveBeenCalledWith(MINT);
    expect(validateSolanaAddress).toHaveBeenCalledWith(DELEGATE);
    expect(buildSplTokenApproveCheckedInstruction).toHaveBeenCalledWith({
      tokenAccount: TOKEN_ACCOUNT,
      mint: MINT,
      delegate: DELEGATE,
      owner: SIGNER,
      amount: 1500000n,
      decimals: 6,
    });
    expect(buildAndSendSolanaTransaction).toHaveBeenCalledWith({
      client: { network: "solana-devnet" },
      instructions: [{ kind: "approve-ix" }],
      senderKeyBytes: KEY_BYTES,
      sponsored: false,
      gasPolicyId: undefined,
    });
    expect(printJSON).toHaveBeenCalledWith({
      action: "approve",
      owner: SIGNER.address,
      tokenAccount: TOKEN_ACCOUNT,
      mint: MINT,
      delegate: DELEGATE,
      amount: "1.5",
      rawAmount: "1500000",
      decimals: 6,
      network: "solana-devnet",
      sponsored: false,
      signature: "sol-sig",
      status: "confirmed",
    });
  });

  it("revokes an SPL token delegate", async () => {
    const printJSON = vi.fn();
    const buildSplTokenRevokeInstruction = vi.fn().mockReturnValue({ kind: "revoke-ix" });
    const buildAndSendSolanaTransaction = vi.fn().mockResolvedValue({
      signature: "sol-revoke-sig",
      fromAddress: SIGNER.address,
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from(KEY_BYTES)),
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => true,
      resolveGasPolicyId: () => "policy-id",
      resolveSolanaFeeSponsored: () => true,
      resolveSolanaFeePolicyId: () => "policy-id",
      clientFromFlags: vi.fn((_program, opts) => ({
        network: opts?.forceNetwork ?? "unexpected-network",
      })),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
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
      parseSolanaKeyBytes: () => KEY_BYTES,
      createSolanaSignerFromKeyBytes: async () => SIGNER,
      buildSplTokenApproveCheckedInstruction: vi.fn(),
      buildSplTokenRevokeInstruction,
      buildAndSendSolanaTransaction,
      waitForSolanaConfirmation: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { performSolanaDelegateRevoke } = await import("../../src/commands/solana-delegate.js");
    await performSolanaDelegateRevoke({} as Command, {
      tokenAccount: TOKEN_ACCOUNT,
    });

    expect(buildSplTokenRevokeInstruction).toHaveBeenCalledWith({
      tokenAccount: TOKEN_ACCOUNT,
      owner: SIGNER,
    });
    expect(buildAndSendSolanaTransaction).toHaveBeenCalledWith({
      client: { network: "solana-devnet" },
      instructions: [{ kind: "revoke-ix" }],
      senderKeyBytes: KEY_BYTES,
      sponsored: true,
      gasPolicyId: "policy-id",
    });
    expect(printJSON).toHaveBeenCalledWith({
      action: "revoke",
      owner: SIGNER.address,
      tokenAccount: TOKEN_ACCOUNT,
      network: "solana-devnet",
      sponsored: true,
      signature: "sol-revoke-sig",
      status: "pending",
    });
  });

  it("rejects session signing until Solana sessions are supported", async () => {
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveSolanaWalletKey: () => JSON.stringify(Array.from(KEY_BYTES)),
      resolveSolanaNetwork: () => "solana-devnet",
      resolveGasSponsored: () => false,
      resolveGasPolicyId: () => undefined,
      resolveSolanaFeeSponsored: () => false,
      resolveSolanaFeePolicyId: () => undefined,
      clientFromFlags: vi.fn(),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
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
      buildSplTokenApproveCheckedInstruction: vi.fn(),
      buildSplTokenRevokeInstruction: vi.fn(),
      buildAndSendSolanaTransaction: vi.fn(),
      waitForSolanaConfirmation: vi.fn(),
    }));
    vi.doMock("@solana/kit", () => ({
      address: (value: string) => value,
    }));

    const { performSolanaDelegateApprove } = await import("../../src/commands/solana-delegate.js");
    await expect(
      performSolanaDelegateApprove({} as Command, {
        tokenAccount: TOKEN_ACCOUNT,
        mint: MINT,
        delegate: DELEGATE,
        amount: "1",
        decimals: "6",
        signer: "session",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message: expect.stringContaining("session wallet does not yet support Solana"),
    });
  });
});
