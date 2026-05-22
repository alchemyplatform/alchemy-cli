const ADMIN_API_TIMEOUT_MS = 10_000;

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

export interface ListAppsResponse {
  apps: App[];
  cursor?: string;
}

function getAdminApiBaseUrl(): string {
  if (process.env.ALCHEMY_ADMIN_API_BASE_URL) {
    return process.env.ALCHEMY_ADMIN_API_BASE_URL.replace(/\/$/, "");
  }
  const domain = process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com";
  return `https://admin-api.${domain}`;
}

async function adminRequest<T>(
  method: string,
  path: string,
  authToken: string,
  body?: unknown,
): Promise<T> {
  const url = `${getAdminApiBaseUrl()}${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(ADMIN_API_TIMEOUT_MS),
  });

  if (resp.status === 401) {
    throw new AdminApiError(401, "Invalid or expired auth token");
  }
  if (resp.status === 403) {
    const text = await resp.text().catch(() => "");
    throw new AdminApiError(403, `Access denied: ${text}`);
  }
  if (resp.status === 404) {
    throw new AdminApiError(404, `Not found: ${path}`);
  }
  if (resp.status === 429) {
    throw new AdminApiError(429, "Rate limited");
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AdminApiError(resp.status, text);
  }

  return resp.json() as Promise<T>;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export interface ChainNetwork {
  id: string;
  name: string;
  networkChainId: string | null;
  isTestnet: boolean;
  availability: string;
  docsUrl: string;
  explorerUrl: string;
  currency: string;
}

export async function getApp(authToken: string, appId: string): Promise<App> {
  const resp = await adminRequest<{ data: App }>("GET", `/v1/apps/${appId}`, authToken);
  return resp.data;
}

export async function listApps(
  authToken: string,
  opts?: { cursor?: string; limit?: number },
): Promise<ListAppsResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const resp = await adminRequest<{ data: ListAppsResponse }>(
    "GET",
    `/v1/apps${qs ? `?${qs}` : ""}`,
    authToken,
  );
  return resp.data;
}

export async function createApp(
  authToken: string,
  body: { name: string; networkAllowlist: string[]; description?: string; products?: string[] },
): Promise<App> {
  const resp = await adminRequest<{ data: App }>("POST", "/v1/apps", authToken, body);
  return resp.data;
}

export async function updateApp(
  authToken: string,
  appId: string,
  body: { name?: string; description?: string },
): Promise<App> {
  const resp = await adminRequest<{ data: App }>("PATCH", `/v1/apps/${appId}`, authToken, body);
  return resp.data;
}

export async function deleteApp(authToken: string, appId: string): Promise<void> {
  await adminRequest<void>("DELETE", `/v1/apps/${appId}`, authToken);
}

export async function updateNetworkAllowlist(
  authToken: string,
  appId: string,
  chainNetworks: string[],
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/networks`,
    authToken,
    { chainNetworks },
  );
  return resp.data;
}

export async function updateAddressAllowlist(
  authToken: string,
  appId: string,
  addressAllowlist: AllowlistEntry[],
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/address-allowlist`,
    authToken,
    { addressAllowlist },
  );
  return resp.data;
}

export async function updateOriginAllowlist(
  authToken: string,
  appId: string,
  originAllowlist: AllowlistEntry[],
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/origin-allowlist`,
    authToken,
    { originAllowlist },
  );
  return resp.data;
}

export async function updateIpAllowlist(
  authToken: string,
  appId: string,
  ipAllowlist: AllowlistEntry[],
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/ip-allowlist`,
    authToken,
    { ipAllowlist },
  );
  return resp.data;
}

export async function listChains(authToken: string): Promise<ChainNetwork[]> {
  const resp = await adminRequest<{ data: ChainNetwork[] }>("GET", "/v1/chains", authToken);
  return resp.data;
}
