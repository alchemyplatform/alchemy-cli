import {
  errInvalidAccessKey,
  errNotFound,
  errRateLimited,
  errAdminAPI,
  errNetwork,
} from "./errors.js";

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
  private accessKey: string;

  constructor(accessKey: string) {
    this.accessKey = accessKey;
  }

  protected baseURL(): string {
    return "https://admin-api.alchemy.com";
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseURL()}${path}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch (err) {
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
    const result = await this.request<{ data: { networks: ChainNetwork[] } }>(
      "GET",
      "/v1/chains",
    );
    return result.data.networks;
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
