import type { Address } from "viem";

export const NATIVE_TOKEN_ADDRESS: Address =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export interface RegistryToken {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
  isNative?: boolean;
  aliases?: string[];
}

// Curated mainnet token registry. Symbols are matched case-insensitively.
// `USDC` is always the canonical (Circle-issued) version; `USDC.e` is the
// legacy bridged variant where applicable.
const REGISTRY: Record<string, RegistryToken[]> = {
  "eth-mainnet": [
    { symbol: "ETH", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Ether", isNative: true },
    { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, name: "Wrapped Ether" },
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, name: "Tether USD" },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8, name: "Wrapped BTC" },
  ],
  "base-mainnet": [
    { symbol: "ETH", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Ether", isNative: true },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, name: "USD Coin" },
    { symbol: "USDbC", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6, name: "USD Base Coin (bridged)" },
    { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18, name: "Coinbase Wrapped Staked ETH" },
  ],
  "arb-mainnet": [
    { symbol: "ETH", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Ether", isNative: true },
    { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, name: "Wrapped Ether" },
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, name: "USD Coin" },
    { symbol: "USDC.e", address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", decimals: 6, name: "Bridged USD Coin (legacy)", aliases: ["USDCe"] },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6, name: "Tether USD" },
    { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "WBTC", address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", decimals: 8, name: "Wrapped BTC" },
    { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, name: "Arbitrum" },
  ],
  "opt-mainnet": [
    { symbol: "ETH", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Ether", isNative: true },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
    { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6, name: "USD Coin" },
    { symbol: "USDC.e", address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", decimals: 6, name: "Bridged USD Coin (legacy)", aliases: ["USDCe"] },
    { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6, name: "Tether USD" },
    { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "WBTC", address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", decimals: 8, name: "Wrapped BTC" },
    { symbol: "OP", address: "0x4200000000000000000000000000000000000042", decimals: 18, name: "Optimism" },
  ],
  "polygon-mainnet": [
    { symbol: "POL", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Polygon Ecosystem Token", isNative: true, aliases: ["MATIC"] },
    { symbol: "WPOL", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18, name: "Wrapped POL", aliases: ["WMATIC"] },
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, name: "USD Coin" },
    { symbol: "USDC.e", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, name: "Bridged USD Coin (legacy)", aliases: ["USDCe"] },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6, name: "Tether USD" },
    { symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, name: "Wrapped Ether" },
    { symbol: "WBTC", address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", decimals: 8, name: "Wrapped BTC" },
  ],
  "bnb-mainnet": [
    { symbol: "BNB", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "BNB", isNative: true },
    { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, name: "Wrapped BNB" },
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, name: "Binance-Peg USD Coin" },
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, name: "Binance-Peg Tether USD" },
    { symbol: "DAI", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18, name: "Binance-Peg Dai Token" },
    { symbol: "WETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18, name: "Binance-Peg Ether" },
    { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18, name: "Binance-Peg BTC" },
  ],
  "avax-mainnet": [
    { symbol: "AVAX", address: NATIVE_TOKEN_ADDRESS, decimals: 18, name: "Avalanche", isNative: true },
    { symbol: "WAVAX", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18, name: "Wrapped AVAX" },
    { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6, name: "USD Coin" },
    { symbol: "USDC.e", address: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", decimals: 6, name: "Bridged USD Coin (legacy)", aliases: ["USDCe"] },
    { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6, name: "Tether USD" },
    { symbol: "USDT.e", address: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118", decimals: 6, name: "Bridged Tether USD (legacy)", aliases: ["USDTe"] },
    { symbol: "DAI.e", address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18, name: "Bridged Dai Stablecoin" },
    { symbol: "WETH.e", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", decimals: 18, name: "Bridged Wrapped Ether" },
  ],
};

function normalize(symbol: string): string {
  return symbol.trim().toUpperCase();
}

const INDEX_CACHE = new Map<string, Map<string, RegistryToken>>();

function indexFor(network: string): Map<string, RegistryToken> {
  const cached = INDEX_CACHE.get(network);
  if (cached) return cached;

  const entries = REGISTRY[network] ?? [];
  const index = new Map<string, RegistryToken>();
  for (const entry of entries) {
    index.set(normalize(entry.symbol), entry);
    for (const alias of entry.aliases ?? []) {
      index.set(normalize(alias), entry);
    }
  }
  INDEX_CACHE.set(network, index);
  return index;
}

export function getRegistryNetworks(): string[] {
  return Object.keys(REGISTRY).sort();
}

export function listRegistryTokens(network: string): RegistryToken[] {
  return REGISTRY[network] ?? [];
}

export function findRegistryToken(
  network: string,
  symbol: string,
): RegistryToken | null {
  return indexFor(network).get(normalize(symbol)) ?? null;
}

export function registrySymbolSuggestions(network: string): string[] {
  return listRegistryTokens(network).map((t) => t.symbol);
}
