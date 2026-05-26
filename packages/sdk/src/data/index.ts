import { getGatewayDomain, type AlchemyApiConfig } from "../config/index.js";
import { validateNetwork } from "../evm/rpc.js";

const DEFAULT_DATA_TIMEOUT_MS = 30_000;
const DEFAULT_BREADCRUMB_HEADER = "alchemy-sdk";

export interface DataClientOptions extends AlchemyApiConfig {
  breadcrumb?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

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
  params?: Record<string, string | string[] | undefined>,
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
