import {
  getAdminApiBaseUrl,
  getGasManagerApiBaseUrl,
  getNotifyApiBaseUrl,
  type AlchemyApiConfig,
} from "../config/index.js";

const DEFAULT_ADMIN_API_TIMEOUT_MS = 10_000;
const DEFAULT_BREADCRUMB_HEADER = "alchemy-sdk";

export interface AdminClientOptions extends AlchemyApiConfig {
  breadcrumb?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
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

export type GasPolicyType = "sponsorship" | "erc20" | "solana";
export type GasPolicyStatus = "active" | "inactive";

export interface GasSponsorshipRules {
  startTimeUnix?: string;
  endTimeUnix?: string;
  sponsorshipExpiryMs?: string;
  maxSpendUsd?: string;
  maxSpendPerSenderUsd?: string;
  maxSpendPerUoUsd?: string;
  maxCount?: string;
  maxCountPerSender?: string;
  senderAllowlist?: string[];
  senderBlocklist?: string[];
  webhookRules?: {
    webhookUrl: string;
    approveOnFailure: boolean;
  };
}

export interface SolanaGasPolicyRules {
  startTimeUnix?: string;
  endTimeUnix?: string;
  maxSpendUsd?: string;
  maxSpendPerTxnUsd?: string;
  maxCount?: string;
}

export interface GasPolicy {
  policyId: string;
  appId: string;
  status: GasPolicyStatus;
  policyName: string;
  policyType: GasPolicyType;
  policyState?: string;
  networks: string[];
  lastUpdatedUnix?: string;
  policyVersion?: number;
  rules?: GasSponsorshipRules;
  solanaRules?: SolanaGasPolicyRules;
  erc20Rules?: Record<string, unknown>;
}

export interface ListGasPoliciesOptions {
  appId: string;
  limit?: number;
  after?: string;
  before?: string;
}

export interface ListGasPoliciesResponse {
  policies: GasPolicy[];
  before: string | null;
  after: string | null;
}

export interface CreateSponsorshipGasPolicyPayload {
  policyName: string;
  policyType: "sponsorship";
  appId: string;
  networks: string[];
  rules: GasSponsorshipRules;
}

export interface CreateSolanaGasPolicyPayload {
  policyName: string;
  policyType: "solana";
  appId: string;
  networks: string[];
  solanaRules: SolanaGasPolicyRules;
}

export type CreateGasPolicyPayload =
  | CreateSponsorshipGasPolicyPayload
  | CreateSolanaGasPolicyPayload;

export interface AlchemyAdminClient {
  getApp(authToken: string, appId: string, options?: AdminClientOptions): Promise<App>;
  listApps(authToken: string, opts?: { cursor?: string; limit?: number }, options?: AdminClientOptions): Promise<ListAppsResponse>;
  createApp(
    authToken: string,
    body: { name: string; networkAllowlist: string[]; description?: string; products?: string[] },
    options?: AdminClientOptions,
  ): Promise<App>;
  updateApp(authToken: string, appId: string, body: { name?: string; description?: string }, options?: AdminClientOptions): Promise<App>;
  deleteApp(authToken: string, appId: string, options?: AdminClientOptions): Promise<void>;
  updateNetworkAllowlist(authToken: string, appId: string, chainNetworks: string[], options?: AdminClientOptions): Promise<App>;
  updateAddressAllowlist(authToken: string, appId: string, addressAllowlist: AllowlistEntry[], options?: AdminClientOptions): Promise<App>;
  updateOriginAllowlist(authToken: string, appId: string, originAllowlist: AllowlistEntry[], options?: AdminClientOptions): Promise<App>;
  updateIpAllowlist(authToken: string, appId: string, ipAllowlist: AllowlistEntry[], options?: AdminClientOptions): Promise<App>;
  listChains(authToken: string, options?: AdminClientOptions): Promise<ChainNetwork[]>;
  listGasManagerPolicies(authToken: string, opts: ListGasPoliciesOptions, options?: AdminClientOptions): Promise<ListGasPoliciesResponse>;
  listAllGasManagerPolicies(authToken: string, opts: { appId: string; limit?: number }, options?: AdminClientOptions): Promise<GasPolicy[]>;
  getGasManagerPolicy(authToken: string, policyId: string, options?: AdminClientOptions): Promise<GasPolicy>;
  createGasManagerPolicy(authToken: string, payload: CreateGasPolicyPayload, options?: AdminClientOptions): Promise<GasPolicy>;
  setGasManagerPolicyStatus(authToken: string, policyId: string, status: GasPolicyStatus, options?: AdminClientOptions): Promise<GasPolicy>;
  listWebhooks(webhookApiKey: string, options?: AdminClientOptions): Promise<unknown>;
  createWebhook(webhookApiKey: string, body: unknown, options?: AdminClientOptions): Promise<unknown>;
  updateWebhook(webhookApiKey: string, body: unknown, options?: AdminClientOptions): Promise<unknown>;
  deleteWebhook(webhookApiKey: string, webhookId: string, options?: AdminClientOptions): Promise<unknown>;
  getWebhookAddresses(webhookApiKey: string, webhookId: string, options?: AdminClientOptions): Promise<unknown>;
  getWebhookNftFilters(webhookApiKey: string, webhookId: string, options?: AdminClientOptions): Promise<unknown>;
}

export function createAlchemyAdminClient(options: AdminClientOptions = {}): AlchemyAdminClient {
  return {
    getApp: (authToken, appId, requestOptions = {}) =>
      getApp(authToken, appId, { ...options, ...requestOptions }),
    listApps: (authToken, opts, requestOptions = {}) =>
      listApps(authToken, opts, { ...options, ...requestOptions }),
    createApp: (authToken, body, requestOptions = {}) =>
      createApp(authToken, body, { ...options, ...requestOptions }),
    updateApp: (authToken, appId, body, requestOptions = {}) =>
      updateApp(authToken, appId, body, { ...options, ...requestOptions }),
    deleteApp: (authToken, appId, requestOptions = {}) =>
      deleteApp(authToken, appId, { ...options, ...requestOptions }),
    updateNetworkAllowlist: (authToken, appId, chainNetworks, requestOptions = {}) =>
      updateNetworkAllowlist(authToken, appId, chainNetworks, { ...options, ...requestOptions }),
    updateAddressAllowlist: (authToken, appId, addressAllowlist, requestOptions = {}) =>
      updateAddressAllowlist(authToken, appId, addressAllowlist, { ...options, ...requestOptions }),
    updateOriginAllowlist: (authToken, appId, originAllowlist, requestOptions = {}) =>
      updateOriginAllowlist(authToken, appId, originAllowlist, { ...options, ...requestOptions }),
    updateIpAllowlist: (authToken, appId, ipAllowlist, requestOptions = {}) =>
      updateIpAllowlist(authToken, appId, ipAllowlist, { ...options, ...requestOptions }),
    listChains: (authToken, requestOptions = {}) =>
      listChains(authToken, { ...options, ...requestOptions }),
    listGasManagerPolicies: (authToken, opts, requestOptions = {}) =>
      listGasManagerPolicies(authToken, opts, { ...options, ...requestOptions }),
    listAllGasManagerPolicies: (authToken, opts, requestOptions = {}) =>
      listAllGasManagerPolicies(authToken, opts, { ...options, ...requestOptions }),
    getGasManagerPolicy: (authToken, policyId, requestOptions = {}) =>
      getGasManagerPolicy(authToken, policyId, { ...options, ...requestOptions }),
    createGasManagerPolicy: (authToken, payload, requestOptions = {}) =>
      createGasManagerPolicy(authToken, payload, { ...options, ...requestOptions }),
    setGasManagerPolicyStatus: (authToken, policyId, status, requestOptions = {}) =>
      setGasManagerPolicyStatus(authToken, policyId, status, { ...options, ...requestOptions }),
    listWebhooks: (webhookApiKey, requestOptions = {}) =>
      listWebhooks(webhookApiKey, { ...options, ...requestOptions }),
    createWebhook: (webhookApiKey, body, requestOptions = {}) =>
      createWebhook(webhookApiKey, body, { ...options, ...requestOptions }),
    updateWebhook: (webhookApiKey, body, requestOptions = {}) =>
      updateWebhook(webhookApiKey, body, { ...options, ...requestOptions }),
    deleteWebhook: (webhookApiKey, webhookId, requestOptions = {}) =>
      deleteWebhook(webhookApiKey, webhookId, { ...options, ...requestOptions }),
    getWebhookAddresses: (webhookApiKey, webhookId, requestOptions = {}) =>
      getWebhookAddresses(webhookApiKey, webhookId, { ...options, ...requestOptions }),
    getWebhookNftFilters: (webhookApiKey, webhookId, requestOptions = {}) =>
      getWebhookNftFilters(webhookApiKey, webhookId, { ...options, ...requestOptions }),
  };
}

export async function getApp(
  authToken: string,
  appId: string,
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>("GET", `/v1/apps/${appId}`, authToken, undefined, options);
  return resp.data;
}

export async function listApps(
  authToken: string,
  opts?: { cursor?: string; limit?: number },
  options: AdminClientOptions = {},
): Promise<ListAppsResponse> {
  const params = new URLSearchParams();
  if (opts?.cursor) params.set("cursor", opts.cursor);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const query = params.toString();
  const resp = await adminRequest<{ data: ListAppsResponse }>(
    "GET",
    `/v1/apps${query ? `?${query}` : ""}`,
    authToken,
    undefined,
    options,
  );
  return resp.data;
}

export async function createApp(
  authToken: string,
  body: { name: string; networkAllowlist: string[]; description?: string; products?: string[] },
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>("POST", "/v1/apps", authToken, body, options);
  return resp.data;
}

export async function updateApp(
  authToken: string,
  appId: string,
  body: { name?: string; description?: string },
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>("PATCH", `/v1/apps/${appId}`, authToken, body, options);
  return resp.data;
}

export async function deleteApp(
  authToken: string,
  appId: string,
  options: AdminClientOptions = {},
): Promise<void> {
  await adminRequest<void>("DELETE", `/v1/apps/${appId}`, authToken, undefined, options);
}

export async function updateNetworkAllowlist(
  authToken: string,
  appId: string,
  chainNetworks: string[],
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/networks`,
    authToken,
    { chainNetworks },
    options,
  );
  return resp.data;
}

export async function updateAddressAllowlist(
  authToken: string,
  appId: string,
  addressAllowlist: AllowlistEntry[],
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/address-allowlist`,
    authToken,
    { addressAllowlist },
    options,
  );
  return resp.data;
}

export async function updateOriginAllowlist(
  authToken: string,
  appId: string,
  originAllowlist: AllowlistEntry[],
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/origin-allowlist`,
    authToken,
    { originAllowlist },
    options,
  );
  return resp.data;
}

export async function updateIpAllowlist(
  authToken: string,
  appId: string,
  ipAllowlist: AllowlistEntry[],
  options: AdminClientOptions = {},
): Promise<App> {
  const resp = await adminRequest<{ data: App }>(
    "PUT",
    `/v1/apps/${appId}/ip-allowlist`,
    authToken,
    { ipAllowlist },
    options,
  );
  return resp.data;
}

export async function listChains(
  authToken: string,
  options: AdminClientOptions = {},
): Promise<ChainNetwork[]> {
  const resp = await adminRequest<{ data: ChainNetwork[] }>("GET", "/v1/chains", authToken, undefined, options);
  return resp.data;
}

export async function listGasManagerPolicies(
  authToken: string,
  opts: ListGasPoliciesOptions,
  options: AdminClientOptions = {},
): Promise<ListGasPoliciesResponse> {
  const params = new URLSearchParams();
  params.set("appId", opts.appId);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.after) params.set("after", opts.after);
  if (opts.before) params.set("before", opts.before);
  const resp = await gasManagerRequest<{ data: ListGasPoliciesResponse }>(
    "GET",
    `/api/gasManager/policies?${params.toString()}`,
    authToken,
    undefined,
    options,
  );
  return resp.data;
}

export async function listAllGasManagerPolicies(
  authToken: string,
  opts: { appId: string; limit?: number },
  options: AdminClientOptions = {},
): Promise<GasPolicy[]> {
  const policies: GasPolicy[] = [];
  const seen = new Set<string>();
  let after: string | undefined;

  do {
    const page = await listGasManagerPolicies(
      authToken,
      {
        appId: opts.appId,
        ...(opts.limit !== undefined && { limit: opts.limit }),
        ...(after && { after }),
      },
      options,
    );
    policies.push(...page.policies);
    const next = page.after ?? undefined;
    if (next && seen.has(next)) break;
    if (next) seen.add(next);
    after = next;
  } while (after);

  return policies;
}

export async function getGasManagerPolicy(
  authToken: string,
  policyId: string,
  options: AdminClientOptions = {},
): Promise<GasPolicy> {
  const resp = await gasManagerRequest<{ data: { policy: GasPolicy } }>(
    "GET",
    `/api/gasManager/policy/${encodeURIComponent(policyId)}`,
    authToken,
    undefined,
    options,
  );
  return resp.data.policy;
}

export async function createGasManagerPolicy(
  authToken: string,
  payload: CreateGasPolicyPayload,
  options: AdminClientOptions = {},
): Promise<GasPolicy> {
  const resp = await gasManagerRequest<{ data: { policy: GasPolicy } }>(
    "POST",
    "/api/gasManager/policy",
    authToken,
    payload,
    options,
  );
  return resp.data.policy;
}

export async function setGasManagerPolicyStatus(
  authToken: string,
  policyId: string,
  status: GasPolicyStatus,
  options: AdminClientOptions = {},
): Promise<GasPolicy> {
  const resp = await gasManagerRequest<{ data: { policy: GasPolicy } }>(
    "PUT",
    `/api/gasManager/policy/${encodeURIComponent(policyId)}/status`,
    authToken,
    { status },
    options,
  );
  return resp.data.policy;
}

export function listWebhooks(
  webhookApiKey: string,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("GET", "/team-webhooks", webhookApiKey, undefined, options);
}

export function createWebhook(
  webhookApiKey: string,
  body: unknown,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("POST", "/create-webhook", webhookApiKey, body, options);
}

export function updateWebhook(
  webhookApiKey: string,
  body: unknown,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("PUT", "/update-webhook", webhookApiKey, body, options);
}

export function deleteWebhook(
  webhookApiKey: string,
  webhookId: string,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("DELETE", `/delete-webhook?webhook_id=${encodeURIComponent(webhookId)}`, webhookApiKey, undefined, options);
}

export function getWebhookAddresses(
  webhookApiKey: string,
  webhookId: string,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("GET", `/webhook-addresses?webhook_id=${encodeURIComponent(webhookId)}`, webhookApiKey, undefined, options);
}

export function getWebhookNftFilters(
  webhookApiKey: string,
  webhookId: string,
  options: AdminClientOptions = {},
): Promise<unknown> {
  return notifyRequest("GET", `/webhook-nft-filters?webhook_id=${encodeURIComponent(webhookId)}`, webhookApiKey, undefined, options);
}

async function adminRequest<T>(
  method: string,
  path: string,
  authToken: string,
  body: unknown,
  options: AdminClientOptions,
): Promise<T> {
  const url = `${getAdminApiBaseUrl(options)}${path}`;
  const fetchFn = options.fetchFn ?? fetch;
  const resp = await fetchFn(url, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": options.breadcrumb ?? DEFAULT_BREADCRUMB_HEADER,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_ADMIN_API_TIMEOUT_MS),
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

async function gasManagerRequest<T>(
  method: string,
  path: string,
  authToken: string,
  body: unknown,
  options: AdminClientOptions,
): Promise<T> {
  return requestJson<T>({
    url: `${getGasManagerApiBaseUrl(options)}${path}`,
    method,
    body,
    options,
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

async function notifyRequest(
  method: string,
  path: string,
  webhookApiKey: string,
  body: unknown,
  options: AdminClientOptions,
): Promise<unknown> {
  return requestJson<unknown>({
    url: `${getNotifyApiBaseUrl(options)}${path}`,
    method,
    body,
    options,
    headers: {
      "X-Alchemy-Token": webhookApiKey,
    },
  });
}

interface JsonRequestArgs {
  url: string;
  method: string;
  body: unknown;
  options: AdminClientOptions;
  headers: Record<string, string>;
}

async function requestJson<T>({
  url,
  method,
  body,
  options,
  headers,
}: JsonRequestArgs): Promise<T> {
  const fetchFn = options.fetchFn ?? fetch;
  const resp = await fetchFn(url, {
    method,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-alchemy-client-breadcrumb": options.breadcrumb ?? DEFAULT_BREADCRUMB_HEADER,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_ADMIN_API_TIMEOUT_MS),
  });

  if (resp.status === 401) {
    throw new AdminApiError(401, "Invalid or expired auth token");
  }
  if (resp.status === 403) {
    const text = await resp.text().catch(() => "");
    throw new AdminApiError(403, `Access denied: ${text}`);
  }
  if (resp.status === 404) {
    throw new AdminApiError(404, `Not found: ${url}`);
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
