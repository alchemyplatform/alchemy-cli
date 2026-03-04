import {
  errInvalidAccessKey,
  errNotFound,
  errRateLimited,
  errAdminAPI,
  errNetwork,
  errInvalidArgs,
} from "./errors.js";
import { timeout as globalTimeout } from "./output.js";
import { isLocalhost, parseBaseURLOverride } from "./client-utils.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ChainNetwork {
  id: string;
  name: string;
  networkChainId: string | null;
  isTestnet: boolean;
  availability: "prerelease" | "public" | "deprecated";
  docsUrl: string;
  explorerUrl: string;
  currency: string;
}

export interface AppChainNetwork {
  name: string;
  id: string;
  networkChainId?: string | null;
  rpcUrl: string;
  wsUrl?: string;
  grpcUrl?: string;
}

export interface AllowlistEntry {
  name?: string;
  value: string;
}

export interface App {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  webhookApiKey: string;
  chainNetworks: AppChainNetwork[];
  products?: string[];
  addressAllowlist?: AllowlistEntry[];
  originAllowlist?: AllowlistEntry[];
  ipAllowlist?: AllowlistEntry[];
  createdAt: string;
}

interface ListAppsResponse {
  apps: App[];
  cursor?: string;
}

// ── Client ───────────────────────────────────────────────────────────

export class AdminClient {
  private static readonly ADMIN_API_HOST = "admin-api.alchemy.com";
  // Test/debug only: used by mock E2E to route admin requests locally.
  private static readonly ADMIN_API_BASE_URL_ENV = "ALCHEMY_ADMIN_API_BASE_URL";
  private accessKey: string;

  constructor(accessKey: string) {
    this.validateAccessKey(accessKey);
    this.accessKey = accessKey;
  }

  protected baseURL(): string {
    const override = this.baseURLOverride();
    if (override) return override.toString().replace(/\/$/, "");
    return "https://admin-api.alchemy.com";
  }

  protected allowedHosts(): Set<string> {
    const hosts = new Set([AdminClient.ADMIN_API_HOST]);
    const override = this.baseURLOverride();
    if (override) hosts.add(override.hostname);
    return hosts;
  }

  protected allowInsecureTransport(hostname: string): boolean {
    return isLocalhost(hostname);
  }

  private baseURLOverride(): URL | null {
    return parseBaseURLOverride(AdminClient.ADMIN_API_BASE_URL_ENV);
  }

  private validateAccessKey(accessKey: string): void {
    if (!accessKey.trim() || /\s/.test(accessKey)) {
      throw errInvalidAccessKey();
    }
  }

  private assertSafeRequestTarget(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw errInvalidArgs("Invalid admin API URL.");
    }

    if (!this.allowedHosts().has(parsed.hostname)) {
      throw errInvalidArgs(`Refusing to send credentials to unexpected host: ${parsed.hostname}`);
    }

    if (parsed.protocol !== "https:" && !this.allowInsecureTransport(parsed.hostname)) {
      throw errInvalidArgs("Refusing to send credentials over non-HTTPS connection.");
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseURL()}${path}`;
    this.assertSafeRequestTarget(url);
    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${this.accessKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw errNetwork(`Request timed out after ${globalTimeout}ms`);
      }
      throw errNetwork((err as Error).message);
    }

    if (resp.status === 401 || resp.status === 403) throw errInvalidAccessKey();
    if (resp.status === 404) {
      const text = await resp.text().catch(() => "");
      throw errNotFound(text || path);
    }
    if (resp.status === 429) throw errRateLimited();

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw errAdminAPI(resp.status, text);
    }

    return resp.json() as Promise<T>;
  }

  async listChains(): Promise<ChainNetwork[]> {
    const result = await this.request<{
      data?: ChainNetwork[] | { networks?: ChainNetwork[]; chains?: ChainNetwork[] };
      networks?: ChainNetwork[];
      chains?: ChainNetwork[];
    }>("GET", "/v1/chains");

    const chains =
      (Array.isArray(result.data) ? result.data : undefined) ??
      (!Array.isArray(result.data) ? result.data?.networks : undefined) ??
      (!Array.isArray(result.data) ? result.data?.chains : undefined) ??
      result.networks ??
      result.chains;

    if (!Array.isArray(chains)) {
      throw errAdminAPI(200, "Unexpected response shape for /v1/chains.");
    }

    return chains;
  }

  async listApps(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<ListAppsResponse> {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const resp = await this.request<{ data: ListAppsResponse }>(
      "GET",
      `/v1/apps${qs ? `?${qs}` : ""}`,
    );
    return resp.data;
  }

  async listAllApps(opts?: { limit?: number }): Promise<{ apps: App[]; pages: number }> {
    const apps: App[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page = await this.listApps({
        ...(cursor && { cursor }),
        ...(opts?.limit !== undefined && { limit: opts.limit }),
      });
      pages += 1;
      apps.push(...page.apps);
      cursor = page.cursor;
      if (cursor && seenCursors.has(cursor)) break;
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    return { apps, pages };
  }

  async getApp(id: string): Promise<App> {
    const resp = await this.request<{ data: App }>("GET", `/v1/apps/${id}`);
    return resp.data;
  }

  async createApp(opts: {
    name: string;
    networks: string[];
    description?: string;
    products?: string[];
  }): Promise<App> {
    const resp = await this.request<{ data: App }>("POST", "/v1/apps", {
      name: opts.name,
      chainNetworks: opts.networks,
      ...(opts.description && { description: opts.description }),
      ...(opts.products && { products: opts.products }),
    });
    return resp.data;
  }

  async deleteApp(id: string): Promise<void> {
    await this.request<unknown>("DELETE", `/v1/apps/${id}`);
  }

  async updateApp(
    id: string,
    opts: { name?: string; description?: string },
  ): Promise<App> {
    const resp = await this.request<{ data: App }>("PATCH", `/v1/apps/${id}`, opts);
    return resp.data;
  }

  async updateNetworkAllowlist(
    id: string,
    networks: string[],
  ): Promise<App> {
    const resp = await this.request<{ data: App }>("PUT", `/v1/apps/${id}/networks`, {
      chainNetworks: networks,
    });
    return resp.data;
  }

  async updateAddressAllowlist(
    id: string,
    addresses: AllowlistEntry[],
  ): Promise<App> {
    const resp = await this.request<{ data: App }>("PUT", `/v1/apps/${id}/address-allowlist`, {
      addressAllowlist: addresses,
    });
    return resp.data;
  }

  async updateOriginAllowlist(
    id: string,
    origins: AllowlistEntry[],
  ): Promise<App> {
    const resp = await this.request<{ data: App }>("PUT", `/v1/apps/${id}/origin-allowlist`, {
      originAllowlist: origins,
    });
    return resp.data;
  }

  async updateIpAllowlist(
    id: string,
    ips: AllowlistEntry[],
  ): Promise<App> {
    const resp = await this.request<{ data: App }>("PUT", `/v1/apps/${id}/ip-allowlist`, {
      ipAllowlist: ips,
    });
    return resp.data;
  }
}
