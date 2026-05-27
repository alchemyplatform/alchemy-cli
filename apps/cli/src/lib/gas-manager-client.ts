import {
  errLoginRequired,
  errNotFound,
  errRateLimited,
  errAdminAPI,
  errInvalidArgs,
  CLIError,
  ErrorCode,
} from "./errors.js";
import {
  isLocalhost,
  parseBaseURLOverride,
  fetchWithTimeout,
  getBaseDomain,
} from "./client-utils.js";
import { debug } from "./output.js";

// ── Types ────────────────────────────────────────────────────────────

export type PolicyType = "sponsorship" | "erc20" | "solana";
export type PolicyStatus = "active" | "inactive";

export interface SponsorshipRules {
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

export interface SolanaRules {
  startTimeUnix?: string;
  endTimeUnix?: string;
  maxSpendUsd?: string;
  maxSpendPerTxnUsd?: string;
  maxCount?: string;
}

export interface Policy {
  policyId: string;
  appId: string;
  status: PolicyStatus;
  policyName: string;
  policyType: PolicyType;
  policyState?: string;
  networks: string[];
  lastUpdatedUnix?: string;
  policyVersion?: number;
  rules?: SponsorshipRules;
  solanaRules?: SolanaRules;
  erc20Rules?: Record<string, unknown>;
}

interface CreateSponsorshipPolicyPayload {
  policyName: string;
  policyType: "sponsorship";
  appId: string;
  networks: string[];
  rules: SponsorshipRules;
}

interface CreateSolanaPolicyPayload {
  policyName: string;
  policyType: "solana";
  appId: string;
  networks: string[];
  solanaRules: SolanaRules;
}

export type CreatePolicyPayload =
  | CreateSponsorshipPolicyPayload
  | CreateSolanaPolicyPayload;

interface ListPoliciesResponse {
  policies: Policy[];
  before: string | null;
  after: string | null;
}

interface ListPoliciesOpts {
  appId: string;
  limit?: number;
  after?: string;
  before?: string;
}

// ── Client ───────────────────────────────────────────────────────────

export type GasManagerCredential = { type: "auth_token"; token: string };

export class GasManagerClient {
  private static get HOST(): string {
    return `manage.g.${getBaseDomain()}`;
  }

  // Test/debug only: route requests to a local mock.
  private static readonly BASE_URL_ENV = "ALCHEMY_GAS_MANAGER_BASE_URL";

  private credential: GasManagerCredential;

  constructor(credential: GasManagerCredential) {
    if (!credential.token.trim()) {
      throw errLoginRequired();
    }
    this.credential = credential;
  }

  protected baseURL(): string {
    const override = this.baseURLOverride();
    if (override) return override.toString().replace(/\/$/, "");
    return `https://manage.g.${getBaseDomain()}`;
  }

  protected allowedHosts(): Set<string> {
    const hosts = new Set([GasManagerClient.HOST]);
    const override = this.baseURLOverride();
    if (override) hosts.add(override.hostname);
    return hosts;
  }

  protected allowInsecureTransport(hostname: string): boolean {
    return isLocalhost(hostname);
  }

  private baseURLOverride(): URL | null {
    return parseBaseURLOverride(GasManagerClient.BASE_URL_ENV);
  }

  private assertSafeRequestTarget(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw errInvalidArgs("Invalid gas manager API URL.");
    }

    if (!this.allowedHosts().has(parsed.hostname)) {
      throw errInvalidArgs(`Refusing to send credentials to unexpected host: ${parsed.hostname}`);
    }

    if (parsed.protocol !== "https:" && !this.allowInsecureTransport(parsed.hostname)) {
      throw errInvalidArgs("Refusing to send credentials over non-HTTPS connection.");
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseURL()}${path}`;
    debug(`${method} ${url}`);
    this.assertSafeRequestTarget(url);
    const resp = await fetchWithTimeout(url, {
      method,
      redirect: "error",
      headers: {
        Authorization: `Bearer ${this.credential.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    if (resp.status === 401) {
      throw errLoginRequired();
    }
    if (resp.status === 403) {
      const detail = await resp.text().catch(() => "");
      let reason: string | undefined;
      try {
        const parsed = JSON.parse(detail);
        reason = parsed?.error?.msg ?? parsed?.message ?? parsed?.error ?? undefined;
      } catch {
        reason = detail || undefined;
      }
      const tail = reason ? ` (${reason})` : "";
      throw new CLIError(
        ErrorCode.AUTH_REQUIRED,
        `Access denied for this Alchemy account or app${tail}. Re-authenticate with 'alchemy auth login' or check that the default app is one you have permission to manage.`,
        "alchemy auth login",
      );
    }
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

  async listPolicies(opts: ListPoliciesOpts): Promise<ListPoliciesResponse> {
    const params = new URLSearchParams();
    params.set("appId", opts.appId);
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.after) params.set("after", opts.after);
    if (opts.before) params.set("before", opts.before);
    const resp = await this.request<{ data: ListPoliciesResponse }>(
      "GET",
      `/api/gasManager/policies?${params.toString()}`,
    );
    return resp.data;
  }

  async listAllPolicies(opts: { appId: string; limit?: number }): Promise<Policy[]> {
    const policies: Policy[] = [];
    const seen = new Set<string>();
    let after: string | undefined;
    do {
      const page = await this.listPolicies({
        appId: opts.appId,
        ...(opts.limit !== undefined && { limit: opts.limit }),
        ...(after && { after }),
      });
      policies.push(...page.policies);
      const next = page.after ?? undefined;
      if (next && seen.has(next)) break;
      if (next) seen.add(next);
      after = next;
    } while (after);
    return policies;
  }

  async getPolicy(policyId: string): Promise<Policy> {
    const resp = await this.request<{ data: { policy: Policy } }>(
      "GET",
      `/api/gasManager/policy/${encodeURIComponent(policyId)}`,
    );
    return resp.data.policy;
  }

  async createPolicy(payload: CreatePolicyPayload): Promise<Policy> {
    const resp = await this.request<{ data: { policy: Policy } }>(
      "POST",
      "/api/gasManager/policy",
      payload,
    );
    return resp.data.policy;
  }

  async setPolicyStatus(policyId: string, status: PolicyStatus): Promise<Policy> {
    const resp = await this.request<{ data: { policy: Policy } }>(
      "PUT",
      `/api/gasManager/policy/${encodeURIComponent(policyId)}/status`,
      { status },
    );
    return resp.data.policy;
  }
}
