import type { Command } from "commander";
import { errInvalidArgs } from "./errors.js";
import { resolveGasPolicyId, resolveGasSponsored } from "./resolve.js";

interface SolanaFeeOptions {
  feeSponsored?: boolean;
  feePolicyId?: string;
}

export function resolveSolanaFeeSponsorship(program: Command): {
  sponsored: boolean;
  feePolicyId?: string;
} {
  const commandWithOpts = program as Command & {
    opts?: () => SolanaFeeOptions;
  };
  const opts = commandWithOpts.opts?.() ?? {};
  const sponsored = opts.feeSponsored ?? resolveGasSponsored(program);
  const feePolicyId = opts.feePolicyId ?? resolveGasPolicyId(program);

  if (sponsored && !feePolicyId) {
    throw errInvalidArgs(
      "Fee sponsorship requires a fee policy ID. Set one with --fee-policy-id or configure a Solana fee policy.",
    );
  }

  return { sponsored, feePolicyId };
}
