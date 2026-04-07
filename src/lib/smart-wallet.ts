import { createSmartWalletClient, alchemyWalletTransport } from "@alchemy/wallet-apis";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain, Address } from "viem";
import type { Command } from "commander";
import { resolveAPIKey, resolveWalletKey, resolveNetwork, resolveGasSponsored, resolveGasPolicyId } from "./resolve.js";
import { networkToChain } from "./chains.js";
import { errAuthRequired, errWalletKeyRequired, errInvalidArgs } from "./errors.js";

function normalizeKey(key: string): `0x${string}` {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

export interface PaymasterConfig {
  policyId: string;
}

export interface WalletContext {
  client: ReturnType<typeof createSmartWalletClient>;
  network: string;
  chain: Chain;
  address: Address;
  paymaster: PaymasterConfig | undefined;
}

export function buildWalletClient(program: Command): WalletContext {
  const walletKey = resolveWalletKey(program);
  if (!walletKey) throw errWalletKeyRequired();

  const apiKey = resolveAPIKey(program);
  if (!apiKey) throw errAuthRequired();

  const network = resolveNetwork(program);
  const chain = networkToChain(network);
  const gasSponsored = resolveGasSponsored(program);
  const gasPolicyId = resolveGasPolicyId(program);

  if (gasSponsored && !gasPolicyId) {
    throw errInvalidArgs(
      "Gas sponsorship requires a gas policy ID. Set one with --gas-policy-id or `alchemy config set gas-policy-id <id>`.",
    );
  }

  const signer = privateKeyToAccount(normalizeKey(walletKey));

  const paymaster = gasSponsored && gasPolicyId
    ? { policyId: gasPolicyId }
    : undefined;

  const client = createSmartWalletClient({
    transport: alchemyWalletTransport({ apiKey }),
    chain,
    signer,
    paymaster,
  });

  return { client, network, chain, address: signer.address, paymaster };
}
