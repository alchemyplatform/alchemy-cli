import { fetchWithTimeout, getBaseDomain } from "./client-utils.js";
import {
  errAuthRequired,
  errInvalidAPIKey,
  errNetwork,
  errRateLimited,
  errInvalidArgs,
} from "./errors.js";

type RestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestRequestOptions {
  method?: RestMethod;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  extraHeaders?: Record<string, string>;
}

function withQuery(url: URL, query?: Record<string, string | undefined>): URL {
  if (!query) return url;
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function requestJSON<T>(
  url: URL,
  options: RestRequestOptions,
): Promise<T> {
  const method = options.method ?? "GET";
  const resp = await fetchWithTimeout(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.extraHeaders ?? {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (resp.status === 429) throw errRateLimited();
  if (resp.status === 401 || resp.status === 403) {
    const detail = await resp.text().catch(() => "");
    throw errInvalidAPIKey(detail || undefined);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw errNetwork(`HTTP ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<T>;
}

export async function callApiData<T>(
  apiKey: string | undefined,
  path: string,
  options: Omit<RestRequestOptions, "path"> = {},
): Promise<T> {
  if (!apiKey) throw errAuthRequired();
  const base = new URL(`https://api.g.${getBaseDomain()}/data/v1/${apiKey}/`);
  const url = withQuery(new URL(path.replace(/^\//, ""), base), options.query);
  return requestJSON<T>(url, { ...options, path });
}

export async function callApiPrices<T>(
  apiKey: string | undefined,
  path: string,
  options: Omit<RestRequestOptions, "path"> = {},
): Promise<T> {
  if (!apiKey) throw errAuthRequired();
  const base = new URL(`https://api.g.${getBaseDomain()}/prices/v1/${apiKey}/`);
  const url = withQuery(new URL(path.replace(/^\//, ""), base), options.query);
  return requestJSON<T>(url, { ...options, path });
}

export async function callNotify<T>(
  token: string | undefined,
  path: string,
  options: Omit<RestRequestOptions, "path"> = {},
): Promise<T> {
  if (!token) {
    throw errInvalidArgs(
      "Webhook API key required. Set ALCHEMY_WEBHOOK_API_KEY (or ALCHEMY_NOTIFY_AUTH_TOKEN) or pass --webhook-api-key.",
    );
  }
  const base = new URL(`https://dashboard.${getBaseDomain()}/api/`);
  const url = withQuery(new URL(path.replace(/^\//, ""), base), options.query);
  return requestJSON<T>(url, {
    ...options,
    path,
    extraHeaders: {
      ...(options.extraHeaders ?? {}),
      "X-Alchemy-Token": token,
    },
  });
}
