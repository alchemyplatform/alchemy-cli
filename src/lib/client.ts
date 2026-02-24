import {
  CLIError,
  errInvalidAPIKey,
  errNetwork,
  errRPC,
  errRateLimited,
} from "./errors.js";

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

export class Client {
  apiKey: string;
  network: string;

  constructor(apiKey: string, network: string) {
    this.apiKey = apiKey;
    this.network = network;
  }

  rpcURL(): string {
    return `https://${this.network}.g.alchemy.com/v2/${this.apiKey}`;
  }

  enhancedURL(): string {
    return `https://${this.network}.g.alchemy.com/nft/v3/${this.apiKey}`;
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
    const body: RPCRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    };

    let resp: Response;
    try {
      resp = await fetch(this.rpcURL(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw errNetwork((err as Error).message);
    }

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) throw errInvalidAPIKey();

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

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
    } catch (err) {
      throw errNetwork((err as Error).message);
    }

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) throw errInvalidAPIKey();

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    return resp.json();
  }
}
