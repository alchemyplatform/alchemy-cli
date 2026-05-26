import { createClient, http } from "viem";
import { getGatewayDomain, type AlchemyApiConfig } from "../config/index.js";
import { isSafeNetworkIdentifier } from "../utils/network.js";

const DEFAULT_RPC_TIMEOUT_MS = 30_000;
const DEFAULT_BREADCRUMB_HEADER = "alchemy-sdk";
const ALCHEMY_RPC_SECRET_PATTERN = /(https?:\/\/[^\s"'<>]+\/v2\/)[^\s"'<>/)]+/g;

export type JsonRpcParams = unknown[] | Record<string, unknown>;

export interface RpcClientOptions extends AlchemyApiConfig {
  breadcrumb?: string;
  endpointUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class RpcApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RpcApiError";
  }
}

export function validateNetwork(network: string): void {
  if (!isSafeNetworkIdentifier(network)) {
    throw new RpcApiError(-32602, `Invalid network identifier: ${network}`);
  }
}

export function networkRpcUrl(network: string, apiKey: string, options: RpcClientOptions = {}): string {
  validateNetwork(network);
  return `https://${network}.${getGatewayDomain(options)}/v2/${apiKey}`;
}

export function globalRpcUrl(apiKey: string, options: RpcClientOptions = {}): string {
  return `https://api.${getGatewayDomain(options)}/v2/${apiKey}`;
}

export function createAlchemyRpcClient(options: RpcClientOptions = {}): AlchemyRpcClient {
  return new AlchemyRpcClient(options);
}

export class AlchemyRpcClient {
  constructor(private readonly options: RpcClientOptions = {}) {}

  networkRpcCall(
    network: string,
    apiKey: string,
    method: string,
    params: JsonRpcParams,
    options: RpcClientOptions = {},
  ): Promise<unknown> {
    return networkRpcCall(network, apiKey, method, params, { ...this.options, ...options });
  }

  globalRpcCall(
    apiKey: string,
    method: string,
    params: unknown[],
    options: RpcClientOptions = {},
  ): Promise<unknown> {
    return globalRpcCall(apiKey, method, params, { ...this.options, ...options });
  }
}

export async function networkRpcCall(
  network: string,
  apiKey: string,
  method: string,
  params: JsonRpcParams,
  options: RpcClientOptions = {},
): Promise<unknown> {
  return jsonRpcRequest(options.endpointUrl ?? networkRpcUrl(network, apiKey, options), method, params, options);
}

export async function globalRpcCall(
  apiKey: string,
  method: string,
  params: unknown[],
  options: RpcClientOptions = {},
): Promise<unknown> {
  return jsonRpcRequest(globalRpcUrl(apiKey, options), method, params, options);
}

async function jsonRpcRequest(
  url: string,
  method: string,
  params: JsonRpcParams,
  options: RpcClientOptions = {},
): Promise<unknown> {
  const client = createClient({
    name: "Alchemy JSON-RPC",
    transport: http(url, {
      fetchFn: createRpcFetch(options.fetchFn),
      fetchOptions: {
        headers: {
          "x-alchemy-client-breadcrumb": options.breadcrumb ?? DEFAULT_BREADCRUMB_HEADER,
        },
      },
      retryCount: 0,
      timeout: options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
    }),
  });

  try {
    return await client.request({
      method: method as never,
      params: params as never,
    });
  } catch (err) {
    throw toRpcApiError(err);
  }
}

function toRpcApiError(err: unknown): RpcApiError {
  if (err instanceof RpcApiError) return err;

  const candidate = err as {
    code?: unknown;
    status?: unknown;
    details?: unknown;
    shortMessage?: unknown;
    message?: unknown;
  };
  const httpError = parseHttpErrorDetails(candidate.details);
  if (httpError) return httpError;

  const parsedRpcError = parseRpcErrorDetails(candidate.details);
  if (parsedRpcError) return parsedRpcError;

  const message =
    cleanDetail(candidate.details) ??
    safeStringValue(candidate.shortMessage) ??
    safeStringValue(candidate.message) ??
    "JSON-RPC request failed";

  if (typeof candidate.status === "number") {
    return new RpcApiError(candidate.status, message, candidate.status);
  }
  if (typeof candidate.code === "number") {
    return new RpcApiError(candidate.code, message);
  }
  return new RpcApiError(-32000, message);
}

function createRpcFetch(fetchFn: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const resp = await fetchFn(input, init);
    if (resp.ok) return resp;

    const text = await resp.text().catch(() => "");
    throw new Error(`Alchemy HTTP ${resp.status}: ${text || `HTTP ${resp.status}`}`);
  };
}

function parseHttpErrorDetails(details: unknown): RpcApiError | null {
  const text = cleanDetail(details);
  const match = text?.match(/^Alchemy HTTP (\d+):\s*([\s\S]*)$/);
  if (!match) return null;

  const status = Number(match[1]);
  const body = match[2] || `HTTP ${status}`;
  if (status !== 401 && status !== 403) {
    const rpcError = parseRpcErrorDetails(body);
    if (rpcError) return rpcError;
  }

  return new RpcApiError(status, body, status);
}

function parseRpcErrorDetails(details: unknown): RpcApiError | null {
  const text = cleanDetail(details);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; message?: unknown }; code?: unknown; message?: unknown };
    const error = parsed.error ?? parsed;
    if (typeof error.code === "number" && typeof error.message === "string") {
      return new RpcApiError(error.code, error.message);
    }
  } catch {
    return null;
  }

  return null;
}

function cleanDetail(value: unknown): string | undefined {
  const text = safeStringValue(value);
  if (!text) return undefined;

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string") return redactRpcSecrets(parsed);
  } catch {
    return text;
  }

  return text;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeStringValue(value: unknown): string | undefined {
  const text = stringValue(value);
  return text ? redactRpcSecrets(text) : undefined;
}

function redactRpcSecrets(value: string): string {
  return value.replace(ALCHEMY_RPC_SECRET_PATTERN, "$1[REDACTED]");
}
