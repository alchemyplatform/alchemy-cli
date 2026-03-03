import type { AlchemyClient } from "./client-interface.js";
import {
  CLIError,
  errInvalidAPIKey,
  errInvalidArgs,
  errNetwork,
  errNetworkNotEnabled,
  errRPC,
  errRateLimited,
} from "./errors.js";
import { parseBaseURLOverride, fetchWithTimeout } from "./client-utils.js";

export interface RPCRequest {
  jsonrpc: string;
  method: string;
  params: unknown[];
  id: number;
}

export interface RPCResponse {
  jsonrpc: string;
  result?: unknown;
  error?: { code: number; message: string };
  id: number;
}

export class Client implements AlchemyClient {
  apiKey: string;
  network: string;
  // Test/debug only: used by mock E2E to route CLI requests locally.
  private static readonly RPC_BASE_URL_ENV = "ALCHEMY_RPC_BASE_URL";

  constructor(apiKey: string, network: string) {
    this.apiKey = apiKey;
    this.network = network;
    this.validateNetwork(network);
  }

  private validateNetwork(network: string): void {
    if (this.rpcBaseURLOverride()) {
      return;
    }

    // Ensure the network value cannot redirect requests to an arbitrary host.
    // A valid Alchemy network slug produces a hostname like "eth-mainnet.g.alchemy.com".
    const hostname = `${network}.g.alchemy.com`;
    let parsed: URL;
    try {
      parsed = new URL(`https://${hostname}`);
    } catch {
      throw errInvalidArgs(`Invalid network: ${network}`);
    }
    if (!parsed.hostname.endsWith(".g.alchemy.com")) {
      throw errInvalidArgs(`Invalid network: ${network} — hostname must end with .g.alchemy.com`);
    }
  }

  private rpcBaseURLOverride(): URL | null {
    return parseBaseURLOverride(Client.RPC_BASE_URL_ENV);
  }

  private rpcBaseURL(): URL {
    const override = this.rpcBaseURLOverride();
    if (override) return override;
    return new URL(`https://${this.network}.g.alchemy.com`);
  }

  rpcURL(): string {
    return new URL(`/v2/${this.apiKey}`, this.rpcBaseURL()).toString();
  }

  enhancedURL(): string {
    return new URL(`/nft/v3/${this.apiKey}`, this.rpcBaseURL()).toString();
  }

  private parseNetworkNotEnabledError(detail: string): CLIError | null {
    const match = detail.match(
      /([A-Z0-9_]+)\s+is not enabled for this app\.\s+Visit this page to enable the network:\s+(https?:\/\/\S+)/i,
    );
    if (!match) return null;
    return errNetworkNotEnabled(match[1], detail);
  }

  private authErrorFromResponseBody(detail: string): CLIError {
    const networkNotEnabled = this.parseNetworkNotEnabledError(detail);
    if (networkNotEnabled) return networkNotEnabled;
    return errInvalidAPIKey(detail || undefined);
  }

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    return fetchWithTimeout(url, init);
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
    const body: RPCRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    };

    const resp = await this.doFetch(this.rpcURL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) {
      const detail = await resp.text().catch(() => "");
      throw this.authErrorFromResponseBody(detail);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    const rpcResp = (await resp.json()) as RPCResponse;

    if (rpcResp.error) {
      throw errRPC(rpcResp.error.code, rpcResp.error.message);
    }

    return rpcResp.result;
  }

  async callEnhanced(
    path: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const url = new URL(`${this.enhancedURL()}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const resp = await this.doFetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) {
      const detail = await resp.text().catch(() => "");
      throw this.authErrorFromResponseBody(detail);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    return resp.json();
  }
}
