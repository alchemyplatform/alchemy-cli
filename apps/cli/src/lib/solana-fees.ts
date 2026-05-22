import type { Command } from "commander";
import { resolveSolanaFeePolicyId, resolveSolanaFeeSponsored, hasAuthLoginToken, resolveSolanaNetwork } from "./resolve.js";
import { isInteractiveAllowed } from "./interaction.js";
import {
  selectOrCreatePolicy,
  errSponsorshipNeedsPolicy,
  errNotLoggedInForPolicyLookup,
} from "./policy-prompt.js";

export async function resolveSolanaFeeSponsorship(program: Command): Promise<{
  sponsored: boolean;
  feePolicyId?: string;
}> {
  const sponsored = resolveSolanaFeeSponsored(program);
  const existing = resolveSolanaFeePolicyId(program);

  if (!sponsored) return { sponsored, feePolicyId: existing };
  if (existing) return { sponsored, feePolicyId: existing };

  if (!isInteractiveAllowed(program)) {
    throw errSponsorshipNeedsPolicy("solana");
  }
  if (!hasAuthLoginToken()) {
    throw errNotLoggedInForPolicyLookup();
  }

  const network = resolveSolanaNetwork(program);
  const selected = await selectOrCreatePolicy({
    flavor: "solana",
    network,
    program,
  });
  if (!selected) {
    throw errSponsorshipNeedsPolicy("solana");
  }
  // Return the resolved id directly — callers thread it through to the
  // transaction builder rather than reading it from env again.
  return { sponsored, feePolicyId: selected };
}
