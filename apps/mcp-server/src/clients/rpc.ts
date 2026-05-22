const RPC_TIMEOUT_MS = 30_000;

/** Validates that a network identifier contains only safe characters (lowercase alphanumeric and hyphens). */
const NETWORK_RE = /^[a-z0-9-]+$/;

export function validateNetwork(network: string): void {
  if (!NETWORK_RE.test(network)) {
    throw new RpcApiError(-32602, `Invalid network identifier: ${network}`);
  }
}

function getGatewayDomain(): string {
  const domain = process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com";
  return `g.${domain}`;
}

export class RpcApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcApiError";
  }
}

/** JSON-RPC call to a network-specific endpoint. */
export async function rpcCall(
  network: string,
  apiKey: string,
  method: string,
  params: unknown[] | Record<string, unknown>,
): Promise<unknown> {
  validateNetwork(network);
  const url = `https://${network}.${getGatewayDomain()}/v2/${apiKey}`;
  return jsonRpcRequest(url, method, params);
}

/** JSON-RPC call to the global API gateway (no network prefix). Used by Wallet API. */
export async function rpcCallGlobal(
  apiKey: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const url = `https://api.${getGatewayDomain()}/v2/${apiKey}`;
  return jsonRpcRequest(url, method, params);
}

async function jsonRpcRequest(
  url: string,
  method: string,
  params: unknown[] | Record<string, unknown>,
): Promise<unknown> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new RpcApiError(resp.status, text || `HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };
  if (json.error) {
    throw new RpcApiError(json.error.code, json.error.message);
  }
  return json.result;
}
