import { CLIError, errInvalidArgs, errNetwork } from "./errors.js";
import { timeout as globalTimeout } from "./output.js";

export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function parseBaseURLOverride(envVarName: string): URL | null {
  const raw = process.env[envVarName];
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw errInvalidArgs(`Invalid ${envVarName} value.`);
  }

  if (!isLocalhost(parsed.hostname)) {
    throw errInvalidArgs(
      `${envVarName} must target localhost or 127.0.0.1.`,
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

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      ...(globalTimeout && { signal: AbortSignal.timeout(globalTimeout) }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw errNetwork(`Request timed out after ${globalTimeout}ms`);
    }
    const message = (err as Error).message ?? String(err);
    // Detect DNS resolution failures — typically caused by an invalid network slug
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
      // Extract the hostname from the URL for a clearer error message
      try {
        const hostname = new URL(url).hostname;
        const networkSlug = hostname.replace(/\.g\.alchemy\.com$/, "");
        if (networkSlug !== hostname) {
          throw errInvalidArgs(
            `Unknown network '${networkSlug}'. Run 'alchemy network list' to see available networks.`,
          );
        }
      } catch (innerErr) {
        if (innerErr instanceof CLIError) throw innerErr;
      }
    }
    throw errNetwork(message);
  }
}
