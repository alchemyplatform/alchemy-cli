import {
  CLIError,
  errInvalidAPIKey,
  errInvalidArgs,
  errNetwork,
  errRPC,
  errRateLimited,
} from "./errors.js";
import { timeout as globalTimeout } from "./output.js";

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

  private isLocalhost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  private rpcBaseURLOverride(): URL | null {
    const raw = process.env[Client.RPC_BASE_URL_ENV];
    if (!raw) return null;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw errInvalidArgs(`Invalid ${Client.RPC_BASE_URL_ENV} value.`);
    }

    if (!this.isLocalhost(parsed.hostname)) {
      throw errInvalidArgs(
        `${Client.RPC_BASE_URL_ENV} must target localhost or 127.0.0.1.`,
      );
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw errInvalidArgs(
        `${Client.RPC_BASE_URL_ENV} must use http:// or https://.`,
      );
    }

    if (parsed.protocol === "http:" && !this.isLocalhost(parsed.hostname)) {
      throw errInvalidArgs(
        `${Client.RPC_BASE_URL_ENV} can only use non-HTTPS for localhost targets.`,
      );
    }

    return parsed;
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
        ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw errNetwork(`Request timed out after ${globalTimeout}ms`);
      }
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
        ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw errNetwork(`Request timed out after ${globalTimeout}ms`);
      }
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
