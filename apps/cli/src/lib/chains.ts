import type { Chain } from "viem";
import {
  supportedWalletNetworks,
  walletNetworkToChain,
} from "@alchemy/sdk/networks";
import { errInvalidArgs } from "./errors.js";

export function networkToChain(network: string): Chain {
  const chain = walletNetworkToChain(network);
  if (!chain) {
    const supported = supportedWalletNetworks().join(", ");
    throw errInvalidArgs(
      `Network "${network}" is not supported for wallet operations. Supported networks: ${supported}`,
    );
  }
  return chain;
}

export function supportedNetworks(): string[] {
  return supportedWalletNetworks();
}
