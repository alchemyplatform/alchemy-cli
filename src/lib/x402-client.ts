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
import { timeout as globalTimeout } from "./output.js";

export class X402Client implements AlchemyClient {
  readonly network: string;
  private readonly privateKey: string;
  private siweToken: string | null = null;

  private static readonly X402_BASE_URL_ENV = "ALCHEMY_X402_BASE_URL";
  private static readonly DEFAULT_BASE = "https://x402.alchemy.com";

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

  private isLocalhost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  private baseURLOverride(): URL | null {
    const raw = process.env[X402Client.X402_BASE_URL_ENV];
    if (!raw) return null;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw errInvalidArgs(`Invalid ${X402Client.X402_BASE_URL_ENV} value.`);
    }

    if (!this.isLocalhost(parsed.hostname)) {
      throw errInvalidArgs(
        `${X402Client.X402_BASE_URL_ENV} must target localhost or 127.0.0.1.`,
      );
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw errInvalidArgs(
        `${X402Client.X402_BASE_URL_ENV} must use http:// or https://.`,
      );
    }

    if (parsed.protocol === "http:" && !this.isLocalhost(parsed.hostname)) {
      throw errInvalidArgs(
        `${X402Client.X402_BASE_URL_ENV} can only use non-HTTPS for localhost targets.`,
      );
    }

    return parsed;
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

  private async ensureSiweToken(): Promise<string> {
    if (this.siweToken) return this.siweToken;
    this.siweToken = await signSiwe({
      privateKey: this.privateKey,
      expiresAfter: "1h",
    });
    return this.siweToken;
  }

  private refreshSiweToken(): void {
    this.siweToken = null;
  }

  async call(method: string, params: unknown[] = []): Promise<unknown> {
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

  private async doFetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw errNetwork(`Request timed out after ${globalTimeout}ms`);
      }
      throw errNetwork((err as Error).message);
    }
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
