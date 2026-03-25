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
import { verbose as isVerbose } from "./output.js";
import { redactSensitiveText } from "./redact.js";

export interface RPCRequest {
  jsonrpc: string;
  method: string;
  params: unknown[] | Record<string, unknown>;
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
      throw errInvalidArgs(
        `Unknown network '${network}'. Run 'alchemy network list' to see available networks.`,
      );
    }
    if (!parsed.hostname.endsWith(".g.alchemy.com")) {
      throw errInvalidArgs(
        `Unknown network '${network}'. Run 'alchemy network list' to see available networks.`,
      );
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

  private tryParseRPCError(text: string): CLIError | null {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.code !== undefined && parsed?.error?.message !== undefined) {
        return errRPC(parsed.error.code, parsed.error.message);
      }
    } catch {
      // Not JSON — fall through
    }
    return null;
  }

  private verboseLog(message: string): void {
    if (isVerbose) {
      process.stderr.write(`[verbose] ${message}\n`);
    }
  }

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    return fetchWithTimeout(url, init);
  }

  async call(method: string, params: unknown[] | Record<string, unknown> = []): Promise<unknown> {
    const body: RPCRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    };

    const redactedURL = redactSensitiveText(this.rpcURL());
    this.verboseLog(`→ POST ${redactedURL}`);
    this.verboseLog(`  method: ${method}`);
    const hasParams = Array.isArray(params) ? params.length > 0 : Object.keys(params).length > 0;
    if (hasParams) {
      this.verboseLog(`  params: ${JSON.stringify(params)}`);
    }
    const startTime = Date.now();

    const resp = await this.doFetch(this.rpcURL(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    this.verboseLog(`← ${resp.status} ${resp.statusText} (${Date.now() - startTime}ms)`);

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) {
      const detail = await resp.text().catch(() => "");
      throw this.authErrorFromResponseBody(detail);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      // Try to parse as JSON-RPC error before falling back to network error
      const rpcError = this.tryParseRPCError(text);
      if (rpcError) throw rpcError;
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

    const redactedURL = redactSensitiveText(url.toString());
    this.verboseLog(`→ GET ${redactedURL}`);
    const startTime = Date.now();

    const resp = await this.doFetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    this.verboseLog(`← ${resp.status} ${resp.statusText} (${Date.now() - startTime}ms)`);

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 401 || resp.status === 403) {
      const detail = await resp.text().catch(() => "");
      throw this.authErrorFromResponseBody(detail);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      const rpcError = this.tryParseRPCError(text);
      if (rpcError) throw rpcError;
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    return resp.json();
  }
}
