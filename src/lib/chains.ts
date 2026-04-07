import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { errInvalidArgs } from "./errors.js";

const SLUG_TO_CHAIN: Record<string, Chain> = {
  "eth-mainnet": viemChains.mainnet,
  "eth-sepolia": viemChains.sepolia,
  "eth-holesky": viemChains.holesky,
  "base-mainnet": viemChains.base,
  "base-sepolia": viemChains.baseSepolia,
  "arb-mainnet": viemChains.arbitrum,
  "arb-sepolia": viemChains.arbitrumSepolia,
  "opt-mainnet": viemChains.optimism,
  "opt-sepolia": viemChains.optimismSepolia,
  "polygon-mainnet": viemChains.polygon,
  "polygon-amoy": viemChains.polygonAmoy,
  "zksync-mainnet": viemChains.zksync,
  "zksync-sepolia": viemChains.zksyncSepoliaTestnet,
  "avax-mainnet": viemChains.avalanche,
  "avax-fuji": viemChains.avalancheFuji,
  "bnb-mainnet": viemChains.bsc,
  "bnb-testnet": viemChains.bscTestnet,
  "linea-mainnet": viemChains.linea,
  "linea-sepolia": viemChains.lineaSepolia,
  "scroll-mainnet": viemChains.scroll,
  "scroll-sepolia": viemChains.scrollSepolia,
  "blast-mainnet": viemChains.blast,
  "blast-sepolia": viemChains.blastSepolia,
  "zora-mainnet": viemChains.zora,
  "zora-sepolia": viemChains.zoraSepolia,
  "celo-mainnet": viemChains.celo,
  "gnosis-mainnet": viemChains.gnosis,
  "mantle-mainnet": viemChains.mantle,
  "worldchain-mainnet": viemChains.worldchain,
  "shape-mainnet": viemChains.shape,
  "unichain-mainnet": viemChains.unichain,
  "unichain-sepolia": viemChains.unichainSepolia,
  "ink-mainnet": viemChains.ink,
  "ink-sepolia": viemChains.inkSepolia,
  "soneium-mainnet": viemChains.soneium,
  "frax-mainnet": viemChains.fraxtal,
  "mode-mainnet": viemChains.mode,
  "berachain-mainnet": viemChains.berachain,
};

export function networkToChain(network: string): Chain {
  const chain = SLUG_TO_CHAIN[network];
  if (!chain) {
    const supported = Object.keys(SLUG_TO_CHAIN).sort().join(", ");
    throw errInvalidArgs(
      `Network "${network}" is not supported for wallet operations. Supported networks: ${supported}`,
    );
  }
  return chain;
}

export function supportedNetworks(): string[] {
  return Object.keys(SLUG_TO_CHAIN).sort();
}
