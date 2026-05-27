import { describe, expect, it } from "vitest";
import { AccountRole, address } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  buildCreateAssociatedTokenAccountIdempotentInstruction,
  buildSplTokenTransferCheckedInstruction,
  SYSTEM_PROGRAM_ADDRESS,
} from "../../src/lib/solana-token.js";

describe("Solana SPL token instructions", () => {
  const owner = { address: address("11111111111111111111111111111111") };
  const mint = address("So11111111111111111111111111111111111111112");
  const tokenProgramAddress = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const sourceTokenAccount = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const destinationTokenAccount = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

  it("builds a transferChecked instruction", () => {
    const instruction = buildSplTokenTransferCheckedInstruction({
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      owner,
      amount: 1500000n,
      decimals: 6,
      tokenProgramAddress,
    });

    expect(instruction.programAddress).toBe(tokenProgramAddress);
    expect(instruction.data).toEqual(new Uint8Array([12, 0x60, 0xe3, 0x16, 0, 0, 0, 0, 0, 6]));
    expect(instruction.accounts).toEqual([
      { address: sourceTokenAccount, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: destinationTokenAccount, role: AccountRole.WRITABLE },
      { address: owner.address, role: AccountRole.READONLY_SIGNER },
    ]);
  });

  it("builds an idempotent associated token account creation instruction", () => {
    const instruction = buildCreateAssociatedTokenAccountIdempotentInstruction({
      payer: owner,
      associatedTokenAccount: destinationTokenAccount,
      owner: owner.address,
      mint,
      tokenProgramAddress,
    });

    expect(instruction.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
    expect(instruction.data).toEqual(new Uint8Array([1]));
    expect(instruction.accounts).toEqual([
      { address: owner.address, role: AccountRole.WRITABLE_SIGNER },
      { address: destinationTokenAccount, role: AccountRole.WRITABLE },
      { address: owner.address, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: tokenProgramAddress, role: AccountRole.READONLY },
    ]);
  });
});
