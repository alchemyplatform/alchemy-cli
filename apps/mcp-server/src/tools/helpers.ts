import { AdminApiError } from "../clients/admin.js";
import { RpcApiError } from "../clients/rpc.js";
import { DataApiError } from "../clients/data.js";
import { getRedisClient } from "../redis.js";
import { hashToken } from "../auth.js";

const REDIS_APP_PREFIX = "app:";

export interface SelectedApp {
  apiKey: string;
  webhookApiKey?: string;
  appId?: string;
  appName?: string;
}

export function requireAuth(authInfo: { token?: string } | undefined): string {
  const token = authInfo?.token;
  if (!token) throw new AuthRequiredError();
  return token;
}

export async function getSelectedApp(
  authInfo: { token?: string } | undefined,
): Promise<SelectedApp> {
  const token = requireAuth(authInfo);
  const redis = getRedisClient();
  const cached = await redis.get(`${REDIS_APP_PREFIX}${hashToken(token)}`);
  if (!cached) {
    throw new AppNotSelectedError();
  }
  const selectedApp = JSON.parse(cached) as SelectedApp;
  if (!selectedApp.apiKey) throw new AppNotSelectedError();
  return selectedApp;
}

export async function getApiKey(
  authInfo: { token?: string } | undefined,
): Promise<string> {
  const { apiKey } = await getSelectedApp(authInfo);
  return apiKey;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Not authenticated. Provide a valid Bearer token.");
    this.name = "AuthRequiredError";
  }
}

export class AppNotSelectedError extends Error {
  constructor() {
    super(
      "No app selected. Call list_apps to see available apps. " +
      "If there is only one app, select it automatically with select_app. " +
      "If there are multiple apps, present the list to the user and ask which one to use. " +
      "Do NOT auto-select when multiple apps are available.",
    );
    this.name = "AppNotSelectedError";
  }
}

export class WebhookApiKeyUnavailableError extends Error {
  constructor(appId: string) {
    super(`Webhook API key is unavailable for app ${appId}. Call get_app to verify the app exists and has webhook access.`);
    this.name = "WebhookApiKeyUnavailableError";
  }
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "*".repeat(key.length);
  return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4);
}

const MAX_RESPONSE_CHARS = 8000;

export function toolError(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function toolResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Format an API result as JSON, truncating if too large for the context window.
 * Adds a truncation notice so the LLM knows results were cut.
 */
export function formatResult(result: unknown): string {
  const json = JSON.stringify(result, null, 2);
  if (json.length <= MAX_RESPONSE_CHARS) return json;
  return (
    json.slice(0, MAX_RESPONSE_CHARS) +
    "\n\n... [truncated — response too large. Use more specific filters or pagination to narrow results.]"
  );
}

export function handleToolError(err: unknown) {
  if (err instanceof AuthRequiredError) {
    return toolError(err.message);
  }
  if (err instanceof AppNotSelectedError) {
    return toolError(err.message);
  }
  if (err instanceof WebhookApiKeyUnavailableError) {
    return toolError(err.message);
  }
  if (err instanceof AdminApiError) {
    if (err.status === 404) return toolError(`Not found: ${err.message}`);
    return toolError(`Admin API error (${err.status}): ${err.message}`);
  }
  if (err instanceof RpcApiError) {
    return toolError(`RPC error (${err.code}): ${err.message}`);
  }
  if (err instanceof DataApiError) {
    return toolError(`API error (${err.status}): ${err.message}`);
  }
  throw err;
}
