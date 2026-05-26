import { getGatewayDomain, type AlchemyApiConfig } from "../config/index.js";
import { validateNetwork } from "../evm/rpc.js";

const DEFAULT_DATA_TIMEOUT_MS = 30_000;
const DEFAULT_BREADCRUMB_HEADER = "alchemy-sdk";

export interface DataClientOptions extends AlchemyApiConfig {
  breadcrumb?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export type DataQueryParams = Record<string, string | string[] | undefined>;
export type DataRequestBody = Record<string, unknown>;

export class DataApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DataApiError";
  }
}

export async function dataGet(
  baseUrl: string,
  apiKey: string,
  path: string,
  params?: DataQueryParams,
  options: DataClientOptions = {},
): Promise<unknown> {
  const url = new URL(`${baseUrl}/${apiKey}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const resp = await dataFetch(url.toString(), "GET", undefined, options);
  return resp.json();
}

export async function dataPost(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
  options: DataClientOptions = {},
): Promise<unknown> {
  const resp = await dataFetch(`${baseUrl}/${apiKey}${path}`, "POST", body, options);
  return resp.json();
}

export function nftBaseUrl(network: string, options: DataClientOptions = {}): string {
  validateNetwork(network);
  return `https://${network}.${getGatewayDomain(options)}/nft/v3`;
}

export function pricesBaseUrl(options: DataClientOptions = {}): string {
  return `https://api.${getGatewayDomain(options)}/prices/v1`;
}

export function portfolioBaseUrl(options: DataClientOptions = {}): string {
  return `https://api.${getGatewayDomain(options)}/data/v1`;
}

export function createAlchemyDataClient(
  apiKey: string,
  options: DataClientOptions = {},
): AlchemyDataClient {
  return new AlchemyDataClient(apiKey, options);
}

export function createAlchemyDataClientFactory(options: DataClientOptions = {}): AlchemyDataClientFactory {
  return new AlchemyDataClientFactory(options);
}

export class AlchemyDataClientFactory {
  constructor(private readonly options: DataClientOptions = {}) {}

  create(apiKey: string, options: DataClientOptions = {}): AlchemyDataClient {
    return createAlchemyDataClient(apiKey, { ...this.options, ...options });
  }
}

export class AlchemyDataClient {
  readonly nft: NftApiClient;
  readonly prices: PricesApiClient;
  readonly portfolio: PortfolioApiClient;

  constructor(
    readonly apiKey: string,
    readonly options: DataClientOptions = {},
  ) {
    this.nft = new NftApiClient(apiKey, options);
    this.prices = new PricesApiClient(apiKey, options);
    this.portfolio = new PortfolioApiClient(apiKey, options);
  }
}

export class NftApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: DataClientOptions = {},
  ) {}

  getNFTsForOwner(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getNFTsForOwner", params);
  }

  getNFTsForContract(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getNFTsForContract", params);
  }

  getNFTMetadata(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getNFTMetadata", params);
  }

  getNFTMetadataBatch(network: string, body: DataRequestBody): Promise<unknown> {
    return this.post(network, "/getNFTMetadataBatch", body);
  }

  getContractMetadata(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getContractMetadata", params);
  }

  getOwnersForNFT(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getOwnersForNFT", params);
  }

  getOwnersForContract(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getOwnersForContract", params);
  }

  getFloorPrice(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getFloorPrice", params);
  }

  isSpamContract(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/isSpamContract", params);
  }

  searchContractMetadata(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/searchContractMetadata", params);
  }

  getNFTSales(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getNFTSales", params);
  }

  getContractsForOwner(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getContractsForOwner", params);
  }

  getNFTsForCollection(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getNFTsForCollection", params);
  }

  getCollectionMetadata(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getCollectionMetadata", params);
  }

  getContractMetadataBatch(network: string, body: DataRequestBody): Promise<unknown> {
    return this.post(network, "/getContractMetadataBatch", body);
  }

  getSpamContracts(network: string): Promise<unknown> {
    return this.get(network, "/getSpamContracts", {});
  }

  isAirdropNFT(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/isAirdropNFT", params);
  }

  summarizeNFTAttributes(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/summarizeNFTAttributes", params);
  }

  isHolderOfContract(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/isHolderOfContract", params);
  }

  computeRarity(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/computeRarity", params);
  }

  getCollectionsForOwner(network: string, params: DataQueryParams): Promise<unknown> {
    return this.get(network, "/getCollectionsForOwner", params);
  }

  private get(network: string, path: string, params: DataQueryParams): Promise<unknown> {
    return dataGet(nftBaseUrl(network, this.options), this.apiKey, path, params, this.options);
  }

  private post(network: string, path: string, body: DataRequestBody): Promise<unknown> {
    return dataPost(nftBaseUrl(network, this.options), this.apiKey, path, body, this.options);
  }
}

export class PricesApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: DataClientOptions = {},
  ) {}

  getTokenPricesBySymbol(params: { symbols: string[] }): Promise<unknown> {
    return dataGet(pricesBaseUrl(this.options), this.apiKey, "/tokens/by-symbol", params, this.options);
  }

  getTokenPricesByAddress(body: { addresses: Array<{ network: string; address: string }> }): Promise<unknown> {
    return dataPost(pricesBaseUrl(this.options), this.apiKey, "/tokens/by-address", body, this.options);
  }

  getHistoricalTokenPrices(body: DataRequestBody): Promise<unknown> {
    return dataPost(pricesBaseUrl(this.options), this.apiKey, "/tokens/historical", body, this.options);
  }
}

export class PortfolioApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: DataClientOptions = {},
  ) {}

  getTokensByAddress(body: PortfolioAddressRequest): Promise<unknown> {
    return this.post("/assets/tokens/by-address", body);
  }

  getTokenBalancesByAddress(body: PortfolioAddressRequest): Promise<unknown> {
    return this.post("/assets/tokens/balances/by-address", body);
  }

  getNFTsByAddress(body: PortfolioAddressRequest): Promise<unknown> {
    return this.post("/assets/nfts/by-address", body);
  }

  getNFTContractsByAddress(body: PortfolioAddressRequest): Promise<unknown> {
    return this.post("/assets/nfts/contracts/by-address", body);
  }

  private post(path: string, body: PortfolioAddressRequest): Promise<unknown> {
    return dataPost(portfolioBaseUrl(this.options), this.apiKey, path, body, this.options);
  }
}

export interface PortfolioAddressEntry {
  address: string;
  networks?: string[];
}

export interface PortfolioAddressRequest {
  addresses: PortfolioAddressEntry[];
}

async function dataFetch(
  url: string,
  method: "GET" | "POST",
  body: unknown,
  options: DataClientOptions,
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  const resp = await fetchFn(url, {
    method,
    headers: {
      ...(body !== undefined && { "Content-Type": "application/json" }),
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": options.breadcrumb ?? DEFAULT_BREADCRUMB_HEADER,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_DATA_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new DataApiError(resp.status, text || `HTTP ${resp.status}`);
  }

  return resp;
}
