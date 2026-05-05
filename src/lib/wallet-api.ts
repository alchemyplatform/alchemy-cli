import { z } from "zod";
import {
  fetchWithTimeout,
  getBaseDomain,
  isLocalhost,
  parseBaseURLOverride,
} from "./client-utils.js";
import {
  CLIError,
  ErrorCode,
  errAuthRequired,
  errInvalidArgs,
  errNotFound,
  errRateLimited,
} from "./errors.js";
import { debug } from "./output.js";

const WALLET_API_BASE_URL_ENV = "ALCHEMY_WALLET_API_BASE_URL";
const ADMIN_API_BASE_URL_ENV = "ALCHEMY_ADMIN_API_BASE_URL";
const STAGING_ADMIN_API_HOST = "admin-api.alchemypreview.com";
const rawWalletSessionStateSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "revoked",
  "expired",
  "PENDING",
  "APPROVED",
  "DENIED",
  "REVOKED",
  "EXPIRED",
]);
const walletSessionStateSchema = z.enum(["pending", "approved", "denied", "revoked", "expired"]);

function adminApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  }).passthrough();
}

const walletSessionCreateResponseSchema = z.object({
  sessionId: z.string().min(1),
  approvalUrl: z.string().url(),
  expiresAt: z.string().datetime().optional(),
}).passthrough();

const rawWalletSessionStatusResponseSchema = z.object({
  sessionId: z.string().min(1).optional(),
  status: rawWalletSessionStateSchema,
  expiresAt: z.string().datetime().optional(),
  providerAppId: z.string().min(1).optional(),
  walletId: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  evmWalletId: z.string().min(1).optional(),
  evmAddress: z.string().min(1).optional(),
  solanaWalletId: z.string().min(1).optional(),
  solanaAddress: z.string().min(1).optional(),
  providerKeyQuorumId: z.string().min(1).optional(),
  providerSignerId: z.string().min(1).optional(),
  chainType: z.string().min(1).optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
}).passthrough();

const walletSessionDisconnectResponseSchema = z.object({
  sessionId: z.string().min(1).optional(),
  status: rawWalletSessionStateSchema.optional().transform((status) =>
    status ? normalizeWalletSessionState(status) : status
  ),
}).passthrough();

const evmSigningSessionBindingBaseSchema = z.object({
  sessionId: z.string().uuid(),
  walletId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  privyKeyQuorumId: z.string().min(1).optional(),
  privySignerId: z.string().min(1).optional(),
});

function ensureSessionSignerBinding(
  input: z.infer<typeof evmSigningSessionBindingBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (!input.privyKeyQuorumId && !input.privySignerId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide privyKeyQuorumId or privySignerId.",
    });
  }
}

const rawEvmSigningChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  challenge: z.string().min(1),
  expiresAt: z.string().datetime(),
  requestExpiry: z.string().min(1),
  method: z.enum(["personal_sign", "eth_signTypedData_v4", "eth_sign7702Authorization"]),
  walletId: z.string().min(1),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  providerKeyQuorumId: z.string().min(1).optional(),
  providerSignerId: z.string().min(1).optional(),
}).strict();

const completeEvmChallengeInputSchema = z.object({
  challengeId: z.string().uuid(),
  signature: z.string().min(1),
}).strict();

const signMessageCompleteResponseSchema = z.object({
  signature: z.string().min(1),
  encoding: z.string().min(1),
}).strict();

const signTypedDataCompleteResponseSchema = z.object({
  signature: z.string().min(1),
  encoding: z.string().min(1),
}).strict();

const signAuthorizationCompleteResponseSchema = z.object({
  authorization: z.object({
    contract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chain_id: z.string().min(1),
    nonce: z.string().min(1),
    r: z.string().min(1),
    s: z.string().min(1),
    y_parity: z.number().int(),
  }).strict(),
}).strict();

export interface CreateWalletSessionInput {
  publicKeyJwk: JsonWebKey;
  requestSignerVersion: string;
  chainType: string;
  capabilities: Record<string, boolean>;
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
    interactive: boolean;
  };
}

export type CreateWalletSessionResponse = z.infer<typeof walletSessionCreateResponseSchema>;
export interface WalletSessionStatusResponse {
  sessionId?: string;
  status: z.infer<typeof walletSessionStateSchema>;
  expiresAt?: string;
  providerAppId?: string;
  walletId?: string;
  address?: string;
  evmWalletId?: string;
  evmAddress?: string;
  solanaWalletId?: string;
  solanaAddress?: string;
  providerKeyQuorumId?: string;
  providerSignerId?: string;
  chainType?: string;
  capabilities?: Record<string, boolean>;
  privyAppId?: string;
  privyKeyQuorumId?: string;
  privySignerId?: string;
}
export type WalletSessionDisconnectResponse = {
  alreadyDisconnected: boolean;
  status: WalletSessionStatusResponse["status"] | null;
};
export type EvmSigningChallengeResponse = z.infer<typeof rawEvmSigningChallengeResponseSchema> & {
  privyKeyQuorumId?: string;
  privySignerId?: string;
};
export type SignMessageCompleteResponse = z.infer<typeof signMessageCompleteResponseSchema>;
export type SignTypedDataCompleteResponse = z.infer<typeof signTypedDataCompleteResponseSchema>;
export type SignAuthorizationCompleteResponse = z.infer<typeof signAuthorizationCompleteResponseSchema>;

export interface EvmSigningSessionBindingInput {
  sessionId: string;
  walletId: string;
  walletAddress: string;
  privyKeyQuorumId?: string;
  privySignerId?: string;
}

export interface SignMessageChallengeInput extends EvmSigningSessionBindingInput {
  message: string;
  encoding: "utf-8" | "hex";
}

export interface SignTypedDataChallengeInput extends EvmSigningSessionBindingInput {
  typedData: Record<string, unknown>;
}

export interface SignAuthorizationChallengeInput extends EvmSigningSessionBindingInput {
  authorization: {
    contract: string;
    chainId: number | string;
    nonce?: number | string;
    executor?: "self";
  };
}

export interface CompleteEvmSigningChallengeInput {
  challengeId: string;
  signature: string;
}

function baseURLOverride(): URL | null {
  const options = { allowedHostnames: [STAGING_ADMIN_API_HOST] };
  return parseBaseURLOverride(WALLET_API_BASE_URL_ENV, options)
    ?? parseBaseURLOverride(ADMIN_API_BASE_URL_ENV, options);
}

function allowedHosts(): Set<string> {
  const hosts = new Set([`admin-api.${getBaseDomain()}`]);
  const override = baseURLOverride();
  if (override) hosts.add(override.hostname);
  return hosts;
}

function baseURL(): string {
  const override = baseURLOverride();
  if (override) return override.toString().replace(/\/$/, "");
  return `https://admin-api.${getBaseDomain()}`;
}

function assertSafeRequestTarget(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw errInvalidArgs("Invalid wallet API URL.");
  }

  if (!allowedHosts().has(parsed.hostname)) {
    throw errInvalidArgs(`Refusing to send credentials to unexpected host: ${parsed.hostname}`);
  }

  if (parsed.protocol !== "https:" && !isLocalhost(parsed.hostname)) {
    throw errInvalidArgs("Refusing to send credentials over non-HTTPS connection.");
  }
}

async function request<T>(
  token: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!token.trim()) throw errAuthRequired();

  const url = `${baseURL()}${path}`;
  debug(`${method} ${url}`);
  assertSafeRequestTarget(url);

  const resp = await fetchWithTimeout(url, {
    method,
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw errAuthRequired();
  }
  if (resp.status === 404) {
    throw errNotFound(path);
  }
  if (resp.status === 429) {
    throw errRateLimited();
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new CLIError(
      ErrorCode.NETWORK_ERROR,
      `Wallet session API error (HTTP ${resp.status})`,
      undefined,
      text || resp.statusText,
    );
  }

  const text = await resp.text().catch(() => "");
  if (!text.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CLIError(
      ErrorCode.NETWORK_ERROR,
      "Wallet session API returned invalid JSON.",
    );
  }
}

export function getWalletApiBaseUrl(): string {
  return baseURL();
}

function unwrapAdminData<T>(schema: z.ZodType<T>, data: unknown): T {
  return adminApiResponseSchema(schema).parse(data).data;
}

function normalizeWalletSessionState(
  status: z.infer<typeof rawWalletSessionStateSchema>,
): z.infer<typeof walletSessionStateSchema> {
  return status.toLowerCase() as z.infer<typeof walletSessionStateSchema>;
}

function normalizeWalletSessionStatus(
  session: z.infer<typeof rawWalletSessionStatusResponseSchema>,
): WalletSessionStatusResponse {
  return {
    ...session,
    status: normalizeWalletSessionState(session.status),
    privyAppId: session.providerAppId,
    privyKeyQuorumId: session.providerKeyQuorumId,
    privySignerId: session.providerSignerId,
  };
}

function normalizeEvmSigningChallengeResponse(
  response: z.infer<typeof rawEvmSigningChallengeResponseSchema>,
): EvmSigningChallengeResponse {
  return {
    ...response,
    privyKeyQuorumId: response.providerKeyQuorumId,
    privySignerId: response.providerSignerId,
  };
}

function toProviderSigningBindingInput<T extends EvmSigningSessionBindingInput>(
  input: T,
): Omit<T, "privyKeyQuorumId" | "privySignerId"> & {
  providerKeyQuorumId?: string;
  providerSignerId?: string;
} {
  const { privyKeyQuorumId, privySignerId, ...rest } = input;
  return {
    ...rest,
    ...(privyKeyQuorumId ? { providerKeyQuorumId: privyKeyQuorumId } : {}),
    ...(privySignerId ? { providerSignerId: privySignerId } : {}),
  };
}

export async function createRemoteWalletSession(
  token: string,
  input: CreateWalletSessionInput,
): Promise<CreateWalletSessionResponse> {
  const data = await request<unknown>(
    token,
    "POST",
    "/wallet/sessions",
    input,
  );
  return unwrapAdminData(walletSessionCreateResponseSchema, data);
}

export async function getRemoteWalletSession(
  token: string,
  sessionId: string,
): Promise<WalletSessionStatusResponse> {
  const data = await request<unknown>(
    token,
    "GET",
    `/wallet/sessions/${encodeURIComponent(sessionId)}`,
  );
  return normalizeWalletSessionStatus(
    unwrapAdminData(rawWalletSessionStatusResponseSchema, data),
  );
}

export async function disconnectRemoteWalletSession(
  token: string,
  sessionId: string,
): Promise<WalletSessionDisconnectResponse> {
  try {
    const data = await request<unknown>(
      token,
      "POST",
      `/wallet/sessions/${encodeURIComponent(sessionId)}/disconnect`,
    );
    const parsed = walletSessionDisconnectResponseSchema.safeParse(
      unwrapAdminData(walletSessionDisconnectResponseSchema, data),
    );
    const status = parsed.success ? parsed.data.status ?? null : null;

    return {
      alreadyDisconnected: status === "revoked" || status === "expired" || status === "denied",
      status,
    };
  } catch (err) {
    if (err instanceof CLIError && err.code === ErrorCode.NOT_FOUND) {
      return {
        alreadyDisconnected: true,
        status: "revoked",
      };
    }
    throw err;
  }
}

async function createEvmSigningChallenge<T>(
  token: string,
  path: string,
  input: unknown,
  parser: z.ZodType<T>,
): Promise<T> {
  const data = await request<unknown>(
    token,
    "POST",
    path,
    input,
  );
  return parser.parse(data);
}

async function completeEvmSigningChallenge<T>(
  token: string,
  path: string,
  input: CompleteEvmSigningChallengeInput,
  parser: z.ZodType<T>,
): Promise<T> {
  const parsedInput = completeEvmChallengeInputSchema.parse(input);
  const data = await request<unknown>(
    token,
    "POST",
    path,
    parsedInput,
  );
  return parser.parse(data);
}

export async function createRemoteSignMessageChallenge(
  token: string,
  input: SignMessageChallengeInput,
): Promise<EvmSigningChallengeResponse> {
  const parsedInput = signMessageChallengeInputSchema.parse(input);
  return createEvmSigningChallenge(
    token,
    "/wallet/evm/sign-message/challenge",
    toProviderSigningBindingInput(parsedInput),
    adminApiResponseSchema(rawEvmSigningChallengeResponseSchema).transform((resp) =>
      normalizeEvmSigningChallengeResponse(resp.data)
    ),
  );
}

export async function completeRemoteSignMessageChallenge(
  token: string,
  input: CompleteEvmSigningChallengeInput,
): Promise<SignMessageCompleteResponse> {
  return completeEvmSigningChallenge(
    token,
    "/wallet/evm/sign-message/complete",
    input,
    adminApiResponseSchema(signMessageCompleteResponseSchema).transform((resp) => resp.data),
  );
}

const signMessageChallengeInputSchema = evmSigningSessionBindingBaseSchema.extend({
  message: z.string().min(1),
  encoding: z.enum(["utf-8", "hex"]),
}).strict().superRefine(ensureSessionSignerBinding);

const signTypedDataChallengeInputSchema = evmSigningSessionBindingBaseSchema.extend({
  typedData: z.object({}).passthrough(),
}).strict().superRefine(ensureSessionSignerBinding);

const signAuthorizationChallengeInputSchema = evmSigningSessionBindingBaseSchema.extend({
  authorization: z.object({
    contract: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    chainId: z.union([z.number().int().nonnegative(), z.string().min(1)]),
    nonce: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
    executor: z.literal("self").optional(),
  }).strict(),
}).strict().superRefine(ensureSessionSignerBinding);

export async function createRemoteSignTypedDataChallenge(
  token: string,
  input: SignTypedDataChallengeInput,
): Promise<EvmSigningChallengeResponse> {
  const parsedInput = signTypedDataChallengeInputSchema.parse(input);
  return createEvmSigningChallenge(
    token,
    "/wallet/evm/sign-typed-data/challenge",
    toProviderSigningBindingInput(parsedInput),
    adminApiResponseSchema(rawEvmSigningChallengeResponseSchema).transform((resp) =>
      normalizeEvmSigningChallengeResponse(resp.data)
    ),
  );
}

export async function completeRemoteSignTypedDataChallenge(
  token: string,
  input: CompleteEvmSigningChallengeInput,
): Promise<SignTypedDataCompleteResponse> {
  return completeEvmSigningChallenge(
    token,
    "/wallet/evm/sign-typed-data/complete",
    input,
    adminApiResponseSchema(signTypedDataCompleteResponseSchema).transform((resp) => resp.data),
  );
}

export async function createRemoteSignAuthorizationChallenge(
  token: string,
  input: SignAuthorizationChallengeInput,
): Promise<EvmSigningChallengeResponse> {
  const parsedInput = signAuthorizationChallengeInputSchema.parse(input);
  return createEvmSigningChallenge(
    token,
    "/wallet/evm/sign-7702-authorization/challenge",
    toProviderSigningBindingInput(parsedInput),
    adminApiResponseSchema(rawEvmSigningChallengeResponseSchema).transform((resp) =>
      normalizeEvmSigningChallengeResponse(resp.data)
    ),
  );
}

export async function completeRemoteSignAuthorizationChallenge(
  token: string,
  input: CompleteEvmSigningChallengeInput,
): Promise<SignAuthorizationCompleteResponse> {
  return completeEvmSigningChallenge(
    token,
    "/wallet/evm/sign-7702-authorization/complete",
    input,
    adminApiResponseSchema(signAuthorizationCompleteResponseSchema).transform((resp) => resp.data),
  );
}
