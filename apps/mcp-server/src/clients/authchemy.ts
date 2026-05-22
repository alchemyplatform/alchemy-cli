const AUTHCHEMY_TIMEOUT_MS = 3_000;

export interface AuthchemyUser {
  id: number;
  extId: string;
  email: string;
  firstName: string;
  lastName: string;
  teamId?: number | null;
  isActive: boolean;
  isStaff: boolean;
  isBillingAdmin: boolean;
  teamRole?: string | null;
  role: string;
  telegramUsername: string;
  discordUsername: string;
  hasJoinedDiscord: boolean;
  lastActive?: string;
  acceptedInvite: boolean;
  createdAt: string;
  referralType?: string | null;
  referredBy?: string | null;
}

function getAuthchemyBaseUrl(): string {
  if (process.env.AUTHCHEMY_BASE_URL) {
    return process.env.AUTHCHEMY_BASE_URL.replace(/\/$/, "");
  }
  const domain = process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com";
  return `https://auth.${domain}`;
}

function getAuthchemySharedSecret(): string {
  const secret = process.env.AUTHCHEMY_SHARED_SECRET;
  if (!secret) {
    throw new Error("AUTHCHEMY_SHARED_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Validates an auth token by calling Authchemy's internal user endpoint.
 * Returns the user if valid, undefined if the token is expired/invalid (401).
 */
export async function fetchUserFromAuthToken(
  authToken: string,
  requestIp?: string,
): Promise<AuthchemyUser | undefined> {
  const url = new URL("/api/internal/user-with-ip-check", getAuthchemyBaseUrl());
  url.searchParams.set("authToken", authToken);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${getAuthchemySharedSecret()}`,
    Accept: "application/json",
    "x-alchemy-client-breadcrumb": "alchemy-mcp-server",
  };
  if (requestIp) {
    headers["x-forwarded-for"] = requestIp;
  }

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(AUTHCHEMY_TIMEOUT_MS),
  });

  if (resp.status === 401) {
    return undefined;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Authchemy error (${resp.status}): ${text}`);
  }

  return (await resp.json()) as AuthchemyUser;
}
