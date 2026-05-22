import { validateNetwork } from "./rpc.js";

const DATA_TIMEOUT_MS = 30_000;

function getGatewayDomain(): string {
  const domain = process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com";
  return `g.${domain}`;
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
): Promise<unknown> {
  const url = new URL(`${baseUrl}/${apiKey}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
    },
    signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new DataApiError(resp.status, text || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function dataPost(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const url = `${baseUrl}/${apiKey}${path}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DATA_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new DataApiError(resp.status, text || `HTTP ${resp.status}`);
  }
  return resp.json();
}

/** NFT API base: https://{network}.g.alchemy.com/nft/v3 */
export function nftBaseUrl(network: string): string {
  validateNetwork(network);
  return `https://${network}.${getGatewayDomain()}/nft/v3`;
}

/** Prices API base: https://api.g.alchemy.com/prices/v1 */
export function pricesBaseUrl(): string {
  return `https://api.${getGatewayDomain()}/prices/v1`;
}

/** Portfolio/Data API base: https://api.g.alchemy.com/data/v1 */
export function portfolioBaseUrl(): string {
  return `https://api.${getGatewayDomain()}/data/v1`;
}
