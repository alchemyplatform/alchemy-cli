import { errInvalidArgs, errNetwork } from "./errors.js";
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
    throw errNetwork((err as Error).message);
  }
}
