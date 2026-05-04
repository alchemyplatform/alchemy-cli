import type { Command } from "commander";
import { errInvalidArgs } from "./errors.js";
import { resolveSolanaFeePolicyId, resolveSolanaFeeSponsored } from "./resolve.js";

export function resolveSolanaFeeSponsorship(program: Command): {
  sponsored: boolean;
  feePolicyId?: string;
} {
  const sponsored = resolveSolanaFeeSponsored(program);
  const feePolicyId = resolveSolanaFeePolicyId(program);

  if (sponsored && !feePolicyId) {
    throw errInvalidArgs(
      "Fee sponsorship requires a fee policy ID. Set one with --fee-policy-id or configure a Solana fee policy.",
    );
  }

  return { sponsored, feePolicyId };
}
