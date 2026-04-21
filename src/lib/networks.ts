import { getBaseDomain } from "./client-utils.js";

export interface RPCNetwork {
  id: string;
  name: string;
  family: string;
  isTestnet: boolean;
  httpsUrlTemplate: string;
}

const TESTNET_TOKEN_RE =
  /(testnet|sepolia|holesky|hoodi|devnet|minato|amoy|fuji|saigon|cardona|aeneid|curtis|chiado|cassiopeia|blaze|ropsten|signet|mocha|fam|bepolia)$/i;

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

function isTestnetNetwork(id: string): boolean {
  return TESTNET_TOKEN_RE.test(id);
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

function toHttpsUrlTemplate(id: string): string {
  const domain = getBaseDomain();
  if (id === "starknet-mainnet" || id === "starknet-sepolia") {
    return `https://${id}.g.${domain}/starknet/version/rpc/v0_10/{apiKey}`;
  }
  return `https://${id}.g.${domain}/v2/{apiKey}`;
}

export function getRPCNetworks(): RPCNetwork[] {
  return RPC_NETWORK_IDS.map((id) => ({
    id,
    name: toDisplayName(id),
    family: toFamily(id),
    isTestnet: isTestnetNetwork(id),
    httpsUrlTemplate: toHttpsUrlTemplate(id),
  }));
}

export function getRPCNetworkIds(): string[] {
  return [...RPC_NETWORK_IDS];
}

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
  flow: "FLOW",
  rootstock: "RBTC",
  zetachain: "ZETA",
  sui: "SUI",
};

export function isSolanaNetwork(networkId: string): boolean {
  return networkId.startsWith("solana-");
}

export function nativeTokenSymbol(networkId: string): string {
  // Extract the chain family prefix from the network slug (e.g. "polygon-mainnet" → "polygon")
  const prefix = networkId.replace(/-(mainnet|testnet|sepolia|holesky|hoodi|devnet|amoy|fuji|cardona|saigon|chiado|signet|mocha|blaze|curtis|bepolia).*$/, "");
  return NATIVE_TOKEN_SYMBOLS[prefix] ?? "ETH";
}
