import type { BaseWalletClient } from "@alchemy/wallet-apis";
import { createClient, type Address, type Chain } from "viem";
import { parseAccount } from "viem/accounts";
import type { Command } from "commander";
import { load as loadConfig, type Config } from "./config.js";
import {
  resolveAPIKey,
  resolveNetwork,
} from "./resolve.js";
import { networkToChain } from "./chains.js";
import { errAuthRequired } from "./errors.js";
import { createAlchemyWalletTransport } from "./wallet-transport.js";

export interface WalletQuoteContext {
  client: BaseWalletClient;
  network: string;
  chain: Chain;
  address: Address;
  paymaster: undefined;
}

export function buildWalletQuoteClient(
  program: Command,
  address: string,
): WalletQuoteContext {
  const apiKey = resolveAPIKey(program);
  if (!apiKey) throw errAuthRequired();

  const cfg: Config = loadConfig();
  const network = resolveNetwork(program, cfg);
  const chain = networkToChain(network);

  const client = createClient({
    account: parseAccount(address as Address),
    transport: createAlchemyWalletTransport(apiKey),
    chain,
    name: "alchemyQuoteClient",
  }) as unknown as BaseWalletClient;

  // Runtime assertion: the cast above drops type safety, so verify the
  // swapActions extension surface exists after .extend() is called downstream.
  // Guard the base client at minimum — extend() must be present.
  if (typeof (client as Record<string, unknown>).extend !== "function") {
    throw new Error("Quote client missing extend(); @alchemy/wallet-apis or viem may have changed.");
  }

  return {
    client,
    network,
    chain,
    address: address as Address,
    paymaster: undefined,
  };
}
