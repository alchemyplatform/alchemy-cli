import { CLIError, errInvalidArgs, errNetwork } from "./errors.js";
import { timeout as globalTimeout } from "./output.js";

const DEFAULT_BASE_DOMAIN = "alchemy.com";

/**
 * Returns the base domain for all Alchemy endpoints.
 * Defaults to "alchemy.com". Override with ALCHEMY_BASE_DOMAIN
 * for staging/testing (e.g. ALCHEMY_BASE_DOMAIN=alchemypreview.com).
 */
export function getBaseDomain(): string {
  if (process.env.ALCHEMY_BASE_DOMAIN) {
    return process.env.ALCHEMY_BASE_DOMAIN;
  }
  return DEFAULT_BASE_DOMAIN;
}

export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

interface BaseURLOverrideOptions {
  allowedHostnames?: readonly string[];
}

export function parseBaseURLOverride(
  envVarName: string,
  options: BaseURLOverrideOptions = {},
): URL | null {
  const raw = process.env[envVarName];
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw errInvalidArgs(`Invalid ${envVarName} value.`);
  }

  const allowedHostnames = options.allowedHostnames ?? [];
  const isAllowedHost = allowedHostnames.includes(parsed.hostname);
  if (!isLocalhost(parsed.hostname) && !isAllowedHost) {
    const targetDescription = allowedHostnames.length > 0
      ? `localhost or one of: ${allowedHostnames.join(", ")}`
      : "localhost or 127.0.0.1";
    throw errInvalidArgs(
      `${envVarName} must target ${targetDescription}.`,
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw errInvalidArgs(
      `${envVarName} must use http:// or https://.`,
    );
  }

  if (parsed.protocol === "http:" && !isLocalhost(parsed.hostname)) {
    throw errInvalidArgs(
      `${envVarName} can only use non-HTTPS for localhost targets.`,
    );
  }

  return parsed;
}

const BREADCRUMB_HEADER = "alchemy-cli";

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        "x-alchemy-client-breadcrumb": BREADCRUMB_HEADER,
      },
      ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw errNetwork(`Request timed out after ${globalTimeout}ms`);
    }
    const message = (err as Error).message ?? String(err);
    // Node's fetch wraps DNS errors in a TypeError with the detail in .cause
    const causeMessage = (err as { cause?: { message?: string } }).cause?.message ?? "";
    const causeCode = (err as { cause?: { code?: string } }).cause?.code ?? "";
    const fullErrorText = `${message} ${causeMessage} ${causeCode}`;
    // Detect DNS resolution failures — typically caused by an invalid network slug
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(fullErrorText)) {
      // Extract the hostname from the URL for a clearer error message
      try {
        const hostname = new URL(url).hostname;
        const networkSlug = hostname.replace(new RegExp(`\\.g\\.${escapeRegExp(getBaseDomain())}$`), "");
        if (networkSlug !== hostname) {
          throw errInvalidArgs(
            `Unknown network '${networkSlug}'. Run 'alchemy evm network list' to see available networks.`,
          );
        }
      } catch (innerErr) {
        if (innerErr instanceof CLIError) throw innerErr;
      }
    }
    throw errNetwork(message);
  }
}
