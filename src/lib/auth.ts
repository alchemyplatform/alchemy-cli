import { createHash, randomBytes } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { URL } from "node:url";
import { getBaseDomain } from "./client-utils.js";
import { AUTH_SUCCESS_HTML, authErrorHtml } from "./auth-html.js";

const AUTH_PORT = 16424;
const AUTH_CALLBACK_PATH = "/callback";
// Public OAuth client — security relies on PKCE, not client secrets.
const OAUTH_CLIENT_ID = "alchemy-cli";

// Environment-based auth URL
function getAuthBaseUrl(): string {
  return process.env.ALCHEMY_AUTH_URL || `https://auth.${getBaseDomain()}`;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// OAuth Authorization URL
// ---------------------------------------------------------------------------

export function getAuthorizeUrl(
  port: number,
  codeChallenge: string,
  state: string,
): string {
  const base = getAuthBaseUrl();
  const url = new URL(`${base}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", `http://localhost:${port}${AUTH_CALLBACK_PATH}`);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface PreparedLogin {
  authorizeUrl: string;
  codeVerifier: string;
  state: string;
}

/**
 * Prepare PKCE values and build the authorize URL.
 * Call this once, display the URL, then pass the result to performBrowserLogin.
 */
export function prepareBrowserLogin(port = AUTH_PORT): PreparedLogin {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const state = generateState();
  return {
    authorizeUrl: getAuthorizeUrl(port, codeChallenge, state),
    codeVerifier,
    state,
  };
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

export function openBrowser(url: string): void {
  const cmd =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "start"
        : "xdg-open";
  // execFile avoids shell injection — no shell interpolation of the URL
  execFile(cmd, [url]);
}

// ---------------------------------------------------------------------------
// Callback server
// ---------------------------------------------------------------------------

interface CallbackResult {
  code: string;
  state: string | null;
  sendSuccess: () => void;
  sendError: (message: string) => void;
}

export function waitForCallback(port: number, timeoutMs = 120_000): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Authentication timed out. Please try again."));
    }, timeoutMs);

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${port}`);

      if (url.pathname !== AUTH_CALLBACK_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const description = url.searchParams.get("error_description") || error;
        clearTimeout(timer);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(authErrorHtml(description));
        server.close();
        reject(new Error(`Authentication failed: ${description}`));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        clearTimeout(timer);
        res.writeHead(400);
        res.end("Missing auth code");
        server.close();
        reject(new Error("Authentication callback missing auth code."));
        return;
      }

      clearTimeout(timer);

      resolve({
        code,
        state: url.searchParams.get("state"),
        sendSuccess: () => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(AUTH_SUCCESS_HTML);
          server.close();
        },
        sendError: (message: string) => {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(authErrorHtml(message));
          server.close();
        },
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      server.close();
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Another 'alchemy auth' may be running.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    server.listen(port, "127.0.0.1");
    // Allow the process to exit naturally even if the server is still listening.
    server.unref();
  });
}

// ---------------------------------------------------------------------------
// Token exchange — standard OAuth 2.0 token endpoint
// ---------------------------------------------------------------------------

export interface TokenExchangeResult {
  token: string;
  expiresAt: string;
}

export async function exchangeCodeForToken(
  code: string,
  port: number,
  options: { codeVerifier: string },
): Promise<TokenExchangeResult> {
  const baseUrl = getAuthBaseUrl();
  const redirectUri = `http://localhost:${port}${AUTH_CALLBACK_PATH}`;

  // Standard OAuth 2.0 token request (application/x-www-form-urlencoded)
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: OAUTH_CLIENT_ID,
    code_verifier: options.codeVerifier,
  });

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const errMsg =
      (errBody as { error_description?: string }).error_description ||
      (errBody as { error?: string }).error ||
      `Token exchange failed (HTTP ${response.status})`;
    throw new Error(errMsg);
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };
  if (!data.access_token) {
    throw new Error("Token exchange response missing access_token");
  }

  // Compute expiry from expires_in seconds
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { token: data.access_token, expiresAt };
}

// ---------------------------------------------------------------------------
// Full browser login flow
// ---------------------------------------------------------------------------

/**
 * Runs the full OAuth 2.0 PKCE browser login flow.
 *
 * Pass a PreparedLogin from prepareBrowserLogin() so the displayed URL
 * and the actual OAuth flow use the same state/PKCE values.
 *
 * The callback server is started immediately so the URL is usable
 * even before the browser opens (e.g. if the user pastes it manually).
 * Pass `skipBrowserOpen: true` if the caller opens the browser itself.
 */
export async function performBrowserLogin(
  prepared?: PreparedLogin,
  options?: { port?: number; skipBrowserOpen?: boolean },
): Promise<TokenExchangeResult> {
  const port = options?.port ?? AUTH_PORT;
  const { authorizeUrl, codeVerifier, state } = prepared ?? prepareBrowserLogin(port);

  // Start server first so the URL works even if pasted before the browser opens
  const callbackPromise = waitForCallback(port);
  if (!options?.skipBrowserOpen) {
    openBrowser(authorizeUrl);
  }
  const callback = await callbackPromise;

  // Validate state to prevent CSRF
  if (callback.state !== state) {
    callback.sendError("State mismatch — possible CSRF attack.");
    throw new Error("OAuth state mismatch. Authentication aborted.");
  }

  try {
    const result = await exchangeCodeForToken(callback.code, port, {
      codeVerifier,
    });
    callback.sendSuccess();
    return result;
  } catch (err) {
    callback.sendError("Failed to complete authentication. Please try again.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Token revocation
// ---------------------------------------------------------------------------

export type RevokeResult = "revoked" | "already_invalid" | "server_error" | "network_error";

/**
 * Revoke a token server-side via the logout endpoint.
 * Never throws — returns the outcome so callers can surface it.
 */
export async function revokeToken(token: string): Promise<RevokeResult> {
  const baseUrl = getAuthBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/api/cli/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (response.ok) {
      return "revoked";
    }
    if (response.status === 401) {
      return "already_invalid";
    }
    return "server_error";
  } catch {
    return "network_error";
  }
}

export { AUTH_PORT, OAUTH_CLIENT_ID };
