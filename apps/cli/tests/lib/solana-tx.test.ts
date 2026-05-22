import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/lib/errors.js";
import { address, AccountRole } from "@solana/kit";
import {
  buildSplTokenApproveCheckedInstruction,
  buildSplTokenRevokeInstruction,
  waitForSolanaConfirmation,
} from "../../src/lib/solana-tx.js";

describe("waitForSolanaConfirmation", () => {
  it("returns true when signature is confirmed", async () => {
    const client = {
      network: "solana-devnet",
      call: async () => ({
        value: [{ confirmationStatus: "confirmed" }],
      }),
      callEnhanced: async () => ({}),
    };

    await expect(waitForSolanaConfirmation(client, "sig", 1000, 0)).resolves.toBe(true);
  });

  it("throws when the confirmed signature has an error", async () => {
    const client = {
      network: "solana-devnet",
      call: async () => ({
        value: [{ confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } }],
      }),
      callEnhanced: async () => ({}),
    };

    await expect(waitForSolanaConfirmation(client, "sig", 1000, 0)).rejects.toMatchObject({
      code: ErrorCode.RPC_ERROR,
      message: "Solana transaction failed.",
      details: JSON.stringify({ InstructionError: [0, "Custom"] }),
    });
  });
});

describe("SPL token delegate instructions", () => {
  const tokenAccount = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const owner = {
    address: address("11111111111111111111111111111111"),
  } as Parameters<typeof buildSplTokenApproveCheckedInstruction>[0]["owner"];

  it("builds an approveChecked instruction", () => {
    const instruction = buildSplTokenApproveCheckedInstruction({
      tokenAccount,
      mint: address("So11111111111111111111111111111111111111112"),
      delegate: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      owner,
      amount: 1500000n,
      decimals: 6,
    });

    expect(instruction.data).toEqual(new Uint8Array([13, 0x60, 0xe3, 0x16, 0, 0, 0, 0, 0, 6]));
    expect(instruction.accounts).toEqual([
      { address: tokenAccount, role: AccountRole.WRITABLE },
      { address: address("So11111111111111111111111111111111111111112"), role: AccountRole.READONLY },
      { address: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), role: AccountRole.READONLY },
      { address: owner.address, role: AccountRole.READONLY_SIGNER },
    ]);
  });

  it("builds a revoke instruction", () => {
    const instruction = buildSplTokenRevokeInstruction({
      tokenAccount,
      owner,
    });

    expect(instruction.data).toEqual(new Uint8Array([5]));
    expect(instruction.accounts).toEqual([
      { address: tokenAccount, role: AccountRole.WRITABLE },
      { address: owner.address, role: AccountRole.READONLY_SIGNER },
    ]);
  });
});
