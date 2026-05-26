import {
  dataGet as sharedDataGet,
  dataPost as sharedDataPost,
  nftBaseUrl as sharedNftBaseUrl,
  portfolioBaseUrl as sharedPortfolioBaseUrl,
  pricesBaseUrl as sharedPricesBaseUrl,
} from "@alchemy/sdk/data";

export { DataApiError } from "@alchemy/sdk/data";

const MCP_CLIENT_OPTIONS = {
  breadcrumb: "alchemy-mcp-server",
} as const;

export async function dataGet(
  baseUrl: string,
  apiKey: string,
  path: string,
  params?: Record<string, string | string[] | undefined>,
): Promise<unknown> {
  return sharedDataGet(baseUrl, apiKey, path, params, MCP_CLIENT_OPTIONS);
}

export async function dataPost(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  return sharedDataPost(baseUrl, apiKey, path, body, MCP_CLIENT_OPTIONS);
}

export function nftBaseUrl(network: string): string {
  return sharedNftBaseUrl(network, MCP_CLIENT_OPTIONS);
}

export function pricesBaseUrl(): string {
  return sharedPricesBaseUrl(MCP_CLIENT_OPTIONS);
}

export function portfolioBaseUrl(): string {
  return sharedPortfolioBaseUrl(MCP_CLIENT_OPTIONS);
}
