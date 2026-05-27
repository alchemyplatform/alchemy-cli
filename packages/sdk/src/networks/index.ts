import type { Chain } from "viem";
import * as viemChains from "viem/chains";
import { getAlchemyBaseDomain, type AlchemyApiConfig } from "../config/index.js";

export interface RPCNetwork {
  id: string;
  name: string;
  family: string;
  isTestnet: boolean;
  httpsUrlTemplate: string;
}

const TESTNET_SUFFIXES = [
  "testnet",
  "sepolia",
  "holesky",
  "hoodi",
  "devnet",
  "minato",
  "amoy",
  "fuji",
  "saigon",
  "cardona",
  "aeneid",
  "curtis",
  "chiado",
  "cassiopeia",
  "blaze",
  "ropsten",
  "signet",
  "mocha",
  "fam",
  "bepolia",
] as const;

const NATIVE_SYMBOL_NETWORK_SUFFIXES = [
  "mainnet",
  "testnet",
  "sepolia",
  "holesky",
  "hoodi",
  "devnet",
  "amoy",
  "fuji",
  "cardona",
  "saigon",
  "chiado",
  "signet",
  "mocha",
  "blaze",
  "curtis",
  "bepolia",
] as const;

const FAMILY_ALIASES: Record<string, string> = {
  arb: "Arbitrum",
  arbnova: "Arbitrum Nova",
  avax: "Avalanche",
  bnb: "BNB Smart Chain",
  eth: "Ethereum",
  opt: "OP Mainnet",
  polygonzkevm: "Polygon zkEVM",
};

const NAME_ALIASES: Record<string, string> = {
  arb: "Arbitrum",
  avax: "Avalanche",
  bnb: "BNB",
  eth: "Ethereum",
  opbnb: "opBNB",
  opt: "OP Mainnet",
  sui: "SUI",
  xmtp: "XMTP",
  zksync: "ZKsync",
};

export const RPC_NETWORK_IDS: readonly string[] = [
  "abstract-mainnet",
  "abstract-testnet",
  "adi-mainnet",
  "adi-testnet",
  "alchemy-internal",
  "alchemy-sepolia",
  "alchemyarb-fam",
  "alchemyarb-sepolia",
  "alterscope-mainnet",
  "anime-mainnet",
  "anime-sepolia",
  "apechain-curtis",
  "apechain-mainnet",
  "aptos-mainnet",
  "aptos-testnet",
  "arb-mainnet",
  "arb-sepolia",
  "arbnova-mainnet",
  "arc-testnet",
  "astar-mainnet",
  "avax-fuji",
  "avax-mainnet",
  "base-mainnet",
  "base-sepolia",
  "berachain-bepolia",
  "berachain-mainnet",
  "bitcoin-mainnet",
  "bitcoin-signet",
  "bitcoin-testnet",
  "blast-mainnet",
  "blast-sepolia",
  "bnb-mainnet",
  "bnb-testnet",
  "bob-mainnet",
  "bob-sepolia",
  "boba-mainnet",
  "boba-sepolia",
  "botanix-mainnet",
  "botanix-testnet",
  "celestiabridge-mainnet",
  "celestiabridge-mocha",
  "celo-mainnet",
  "celo-sepolia",
  "citrea-mainnet",
  "citrea-testnet",
  "clankermon-mainnet",
  "commons-mainnet",
  "crossfi-mainnet",
  "crossfi-testnet",
  "degen-mainnet",
  "degen-sepolia",
  "earnm-mainnet",
  "earnm-sepolia",
  "edge-mainnet",
  "edge-testnet",
  "eth-holesky",
  "eth-holeskybeacon",
  "eth-hoodi",
  "eth-hoodibeacon",
  "eth-mainnet",
  "eth-mainnetbeacon",
  "eth-sepolia",
  "eth-sepoliabeacon",
  "flow-mainnet",
  "flow-testnet",
  "frax-hoodi",
  "frax-mainnet",
  "galactica-cassiopeia",
  "galactica-mainnet",
  "gensyn-mainnet",
  "gensyn-testnet",
  "gnosis-chiado",
  "gnosis-mainnet",
  "humanity-mainnet",
  "humanity-testnet",
  "hyperliquid-mainnet",
  "hyperliquid-testnet",
  "ink-mainnet",
  "ink-sepolia",
  "lens-mainnet",
  "lens-sepolia",
  "linea-mainnet",
  "linea-sepolia",
  "mantle-mainnet",
  "mantle-sepolia",
  "megaeth-mainnet",
  "megaeth-testnet",
  "metis-mainnet",
  "mode-mainnet",
  "mode-sepolia",
  "monad-mainnet",
  "monad-testnet",
  "moonbeam-mainnet",
  "mythos-mainnet",
  "opbnb-mainnet",
  "opbnb-testnet",
  "openloot-sepolia",
  "opt-mainnet",
  "opt-sepolia",
  "plasma-mainnet",
  "plasma-testnet",
  "polygon-amoy",
  "polygon-mainnet",
  "polygonzkevm-cardona",
  "polygonzkevm-mainnet",
  "polynomial-mainnet",
  "polynomial-sepolia",
  "race-mainnet",
  "race-sepolia",
  "risa-testnet",
  "rise-testnet",
  "ronin-mainnet",
  "ronin-saigon",
  "rootstock-mainnet",
  "rootstock-testnet",
  "scroll-mainnet",
  "scroll-sepolia",
  "sei-mainnet",
  "sei-testnet",
  "settlus-mainnet",
  "settlus-septestnet",
  "shape-mainnet",
  "shape-sepolia",
  "solana-devnet",
  "solana-mainnet",
  "soneium-mainnet",
  "soneium-minato",
  "sonic-blaze",
  "sonic-mainnet",
  "sonic-testnet",
  "stable-mainnet",
  "stable-testnet",
  "standard-mainnet",
  "starknet-mainnet",
  "starknet-sepolia",
  "story-aeneid",
  "story-mainnet",
  "sui-mainnet",
  "sui-testnet",
  "superseed-mainnet",
  "superseed-sepolia",
  "synd-mainnet",
  "syndicate-manchego",
  "tea-sepolia",
  "tempo-testnet",
  "tron-mainnet",
  "tron-testnet",
  "unichain-mainnet",
  "unichain-sepolia",
  "unite-mainnet",
  "unite-testnet",
  "worldchain-mainnet",
  "worldchain-sepolia",
  "worldl3-devnet",
  "worldmobile-devnet",
  "worldmobile-testnet",
  "worldmobilechain-mainnet",
  "xmtp-mainnet",
  "xmtp-ropsten",
  "xprotocol-mainnet",
  "zetachain-mainnet",
  "zetachain-testnet",
  "zksync-mainnet",
  "zksync-sepolia",
  "zora-mainnet",
  "zora-sepolia",
];

const WALLET_NETWORK_TO_CHAIN: Record<string, Chain> = {
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
  "monad-mainnet": viemChains.monad,
  "monad-testnet": viemChains.monadTestnet,
  "berachain-mainnet": viemChains.berachain,
};

const NATIVE_TOKEN_SYMBOLS: Record<string, string> = {
  eth: "ETH",
  arb: "ETH",
  arbnova: "ETH",
  opt: "ETH",
  base: "ETH",
  zksync: "ETH",
  scroll: "ETH",
  blast: "ETH",
  linea: "ETH",
  zora: "ETH",
  shape: "ETH",
  polygon: "POL",
  polygonzkevm: "ETH",
  bnb: "BNB",
  opbnb: "BNB",
  avax: "AVAX",
  solana: "SOL",
  starknet: "ETH",
  fantom: "FTM",
  metis: "METIS",
  mantle: "MNT",
  celo: "CELO",
  gnosis: "xDAI",
  frax: "frxETH",
  worldchain: "ETH",
  berachain: "BERA",
  monad: "MON",
  flow: "FLOW",
  rootstock: "RBTC",
  zetachain: "ZETA",
  sui: "SUI",
};

function isTestnetNetwork(id: string): boolean {
  const normalized = id.toLowerCase();
  return TESTNET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function tokenToName(token: string): string {
  const alias = NAME_ALIASES[token];
  if (alias) return alias;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function toFamily(id: string): string {
  const [head] = id.split("-");
  return FAMILY_ALIASES[head] ?? tokenToName(head);
}

function toDisplayName(id: string): string {
  return id
    .split("-")
    .map((part) => tokenToName(part))
    .join(" ");
}

function toHttpsUrlTemplate(id: string, options: AlchemyApiConfig = {}): string {
  const domain = getAlchemyBaseDomain(options);
  if (id === "starknet-mainnet" || id === "starknet-sepolia") {
    return `https://${id}.g.${domain}/starknet/version/rpc/v0_10/{apiKey}`;
  }
  return `https://${id}.g.${domain}/v2/{apiKey}`;
}

export function getRPCNetworks(options: AlchemyApiConfig = {}): RPCNetwork[] {
  return RPC_NETWORK_IDS.map((id) => ({
    id,
    name: toDisplayName(id),
    family: toFamily(id),
    isTestnet: isTestnetNetwork(id),
    httpsUrlTemplate: toHttpsUrlTemplate(id, options),
  }));
}

export function getRPCNetworkIds(): string[] {
  return [...RPC_NETWORK_IDS];
}

export function isSolanaNetwork(networkId: string): boolean {
  return networkId.startsWith("solana-");
}

export function toAdminNetworkId(slug: string): string {
  return slug.trim().toUpperCase().replace(/-/g, "_");
}

export function fromAdminNetworkId(id: string): string {
  return id.trim().toLowerCase().replace(/_/g, "-");
}

export function nativeTokenSymbol(networkId: string): string {
  const parts = networkId.split("-");
  const suffixIndex = parts.findIndex((part, index) => {
    if (index === 0) return false;
    const normalized = part.toLowerCase();
    return NATIVE_SYMBOL_NETWORK_SUFFIXES.some((suffix) => normalized.startsWith(suffix));
  });
  const prefix = suffixIndex === -1
    ? networkId
    : parts.slice(0, suffixIndex).join("-");
  return NATIVE_TOKEN_SYMBOLS[prefix] ?? "ETH";
}

export function walletNetworkToChain(network: string): Chain | undefined {
  return WALLET_NETWORK_TO_CHAIN[network];
}

export function supportedWalletNetworks(): string[] {
  return Object.keys(WALLET_NETWORK_TO_CHAIN).sort();
}
