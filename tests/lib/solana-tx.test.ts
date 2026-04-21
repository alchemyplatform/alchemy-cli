import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/lib/errors.js";
import { waitForSolanaConfirmation } from "../../src/lib/solana-tx.js";

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
