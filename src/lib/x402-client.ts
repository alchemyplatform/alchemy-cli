import { signSiwe, createPayment } from "@alchemy/x402";
import type { AlchemyClient } from "./client-interface.js";
import type { RPCRequest, RPCResponse } from "./client.js";
import {
  errInvalidArgs,
  errNetwork,
  errRPC,
  errRateLimited,
  CLIError,
  ErrorCode,
} from "./errors.js";
import { parseBaseURLOverride, fetchWithTimeout, getBaseDomain } from "./client-utils.js";
import { load as loadConfig, save as saveConfig } from "./config.js";
import { debug } from "./output.js";

export class X402Client implements AlchemyClient {
  readonly network: string;
  private readonly privateKey: string;
  private siweToken: string | null = null;

  private static readonly X402_BASE_URL_ENV = "ALCHEMY_X402_BASE_URL";
  private static get DEFAULT_BASE(): string { return `https://x402.${getBaseDomain()}`; }

  constructor(privateKey: string, network: string) {
    this.privateKey = privateKey;
    this.network = network;
    this.validateNetwork(network);
  }

  private validateNetwork(network: string): void {
    if (this.baseURLOverride()) return;
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(network)) {
      throw errInvalidArgs(`Invalid network: ${network}`);
    }
  }

  private baseURLOverride(): URL | null {
    return parseBaseURLOverride(X402Client.X402_BASE_URL_ENV);
  }

  private baseURL(): URL {
    const override = this.baseURLOverride();
    if (override) return override;
    return new URL(X402Client.DEFAULT_BASE);
  }

  private rpcURL(): string {
    return new URL(`/${this.network}/v2`, this.baseURL()).toString();
  }

  private enhancedURL(): string {
    return new URL(`/${this.network}/nft/v3`, this.baseURL()).toString();
  }

  private static readonly SIWE_TTL = "1h";
  private static readonly SIWE_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5min before expiry

  private async ensureSiweToken(): Promise<string> {
    if (this.siweToken) return this.siweToken;

    // Try to load a cached token from config
    const cfg = loadConfig();
    if (cfg.siwe_token && cfg.siwe_token_expires_at) {
      const expiry = new Date(cfg.siwe_token_expires_at);
      const remaining = expiry.getTime() - Date.now();
      debug(`SIWE: found cached token (length=${cfg.siwe_token.length}, remaining=${Math.round(remaining / 1000)}s)`);
      if (!Number.isNaN(expiry.getTime()) && remaining > X402Client.SIWE_EXPIRY_BUFFER_MS) {
        this.siweToken = cfg.siwe_token;
        return this.siweToken;
      }
      debug("SIWE: cached token expired or expiring soon");
    } else {
      debug("SIWE: no cached token in config");
    }

    // Generate a fresh token and cache it
    debug("SIWE: generating fresh token");
    this.siweToken = await signSiwe({
      privateKey: this.privateKey,
      expiresAfter: X402Client.SIWE_TTL,
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    debug(`SIWE: saving token to config (length=${this.siweToken.length}, expires=${expiresAt})`);
    saveConfig({ ...loadConfig(), siwe_token: this.siweToken, siwe_token_expires_at: expiresAt });
    return this.siweToken;
  }

  private refreshSiweToken(): void {
    this.siweToken = null;
    // Clear cached token so next ensureSiweToken generates a fresh one
    const cfg = loadConfig();
    saveConfig({ ...cfg, siwe_token: undefined, siwe_token_expires_at: undefined });
  }

  async call(method: string, params: unknown[] | Record<string, unknown> = []): Promise<unknown> {
    const body: RPCRequest = { jsonrpc: "2.0", method, params, id: 1 };
    const jsonBody = JSON.stringify(body);

    const buildInit = (extra?: Record<string, string>): RequestInit => ({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `SIWE ${this.siweToken!}`,
        ...extra,
      },
      body: jsonBody,
    });

    await this.ensureSiweToken();
    let resp = await this.doFetch(this.rpcURL(), buildInit());

    resp = await this.handleAuthAndPayment(resp, {
      authRetry: async () => {
        this.refreshSiweToken();
        await this.ensureSiweToken();
        return this.doFetch(this.rpcURL(), buildInit());
      },
      paymentRetry: async (paymentSig) =>
        this.doFetch(this.rpcURL(), buildInit({ "Payment-Signature": paymentSig })),
    });

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 402) throw await this.parsePaymentError(resp);
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
    const urlStr = url.toString();

    const buildInit = (extra?: Record<string, string>): RequestInit => ({
      headers: {
        Accept: "application/json",
        Authorization: `SIWE ${this.siweToken!}`,
        ...extra,
      },
    });

    await this.ensureSiweToken();
    let resp = await this.doFetch(urlStr, buildInit());

    resp = await this.handleAuthAndPayment(resp, {
      authRetry: async () => {
        this.refreshSiweToken();
        await this.ensureSiweToken();
        return this.doFetch(urlStr, buildInit());
      },
      paymentRetry: async (paymentSig) =>
        this.doFetch(urlStr, buildInit({ "Payment-Signature": paymentSig })),
    });

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 402) throw await this.parsePaymentError(resp);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    return resp.json();
  }

  async callRest(
    path: string,
    options: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {},
  ): Promise<unknown> {
    const base = new URL(`/${path.replace(/^\//, "")}`, this.baseURL());
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== "") base.searchParams.set(k, v);
      }
    }
    const urlStr = base.toString();
    const method = options.method ?? "GET";

    const buildInit = (extra?: Record<string, string>): RequestInit => ({
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `SIWE ${this.siweToken!}`,
        ...extra,
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });

    await this.ensureSiweToken();
    let resp = await this.doFetch(urlStr, buildInit());

    resp = await this.handleAuthAndPayment(resp, {
      authRetry: async () => {
        this.refreshSiweToken();
        await this.ensureSiweToken();
        return this.doFetch(urlStr, buildInit());
      },
      paymentRetry: async (paymentSig) =>
        this.doFetch(urlStr, buildInit({ "Payment-Signature": paymentSig })),
    });

    if (resp.status === 429) throw errRateLimited();
    if (resp.status === 402) throw await this.parsePaymentError(resp);
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errNetwork(`HTTP ${resp.status}: ${text}`);
    }

    return resp.json();
  }

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    return fetchWithTimeout(url, init);
  }

  private async parsePaymentError(resp: Response): Promise<CLIError> {
    const text = await resp.text().catch(() => "");
    try {
      const body = JSON.parse(text);
      const reason = body?.extensions?.paymentError?.info?.reason;
      const message = body?.extensions?.paymentError?.info?.message;
      const payer = body?.extensions?.paymentError?.info?.payer;

      if (reason === "insufficient_funds") {
        const network = body?.accepts?.[0]?.network;
        const asset = body?.accepts?.[0]?.extra?.name ?? "USDC";
        const networkLabel = network === "eip155:8453" ? "Base" : network ?? "the payment network";
        return new CLIError(
          ErrorCode.PAYMENT_REQUIRED,
          `Insufficient ${asset} balance on ${networkLabel}. ${message ?? ""}`.trim(),
          `Fund wallet ${payer ?? ""} with ${asset} on ${networkLabel} to use x402.`.trim(),
        );
      }

      return new CLIError(
        ErrorCode.PAYMENT_REQUIRED,
        `x402 payment failed: ${message || body?.error || text}`,
      );
    } catch {
      return new CLIError(
        ErrorCode.PAYMENT_REQUIRED,
        `x402 payment failed: ${text}`,
      );
    }
  }

  private async handleAuthAndPayment(
    resp: Response,
    retries: {
      authRetry: () => Promise<Response>;
      paymentRetry: (paymentSig: string) => Promise<Response>;
    },
  ): Promise<Response> {
    if (resp.status === 401) {
      const detail = await resp.text().catch(() => "");
      if (detail.includes("MESSAGE_EXPIRED")) {
        return retries.authRetry();
      }
      throw new CLIError(
        ErrorCode.AUTH_REQUIRED,
        `x402 authentication failed: ${detail || "unauthorized"}`,
        "Check your wallet key and try again.",
      );
    }

    if (resp.status === 402) {
      const paymentRequiredHeader = resp.headers.get("payment-required");
      if (!paymentRequiredHeader) {
        throw new CLIError(
          ErrorCode.PAYMENT_REQUIRED,
          "x402 payment required but no Payment-Required header received.",
        );
      }

      const paymentSignature = await createPayment({
        privateKey: this.privateKey,
        paymentRequiredHeader,
      });

      return retries.paymentRetry(paymentSignature);
    }

    return resp;
  }
}
