import { createHash, randomBytes } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import type { Socket } from "node:net";
import { platform } from "node:os";
import { URL } from "node:url";
import { getBaseDomain } from "./client-utils.js";
import { AUTH_SUCCESS_HTML, authErrorHtml } from "./auth-html.js";

const AUTH_PORT = 16424;
const AUTH_CALLBACK_PATH = "/callback";
// Default token TTL: 90 days in seconds. Server caps at CLI_SESSION_MAX_AGE_SECONDS
// (authchemy settings.ts). If the server cap changes, update this value to match.
const DEFAULT_EXPIRES_IN_SECONDS = 90 * 24 * 60 * 60;

// Environment-based auth URL
function getAuthBaseUrl(): string {
  return process.env.ALCHEMY_AUTH_URL || `https://auth.${getBaseDomain()}`;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function getLoginUrl(
  port: number,
  codeChallenge?: string,
): string {
  const base = getAuthBaseUrl();
  const redirect = encodeURIComponent(`http://localhost:${port}${AUTH_CALLBACK_PATH}`);
  let url = `${base}/login?redirectUrl=${redirect}&_t=${Date.now()}`;
  if (codeChallenge) {
    url += `&code_challenge=${encodeURIComponent(codeChallenge)}`;
  }
  return url;
}

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

interface CallbackResult {
  code: string;
  sendSuccess: () => Promise<void>;
  sendError: (message: string) => Promise<void>;
}

function closeServer(args: {
  server: ReturnType<typeof createServer>;
  sockets: Set<Socket>;
}): Promise<void> {
  const { server, sockets } = args;
  return new Promise((resolve) => {
    server.close(() => resolve());
    for (const socket of sockets) {
      socket.destroy();
    }
  });
}

async function sendCallbackResponse(args: {
  server: ReturnType<typeof createServer>;
  sockets: Set<Socket>;
  req: IncomingMessage;
  res: ServerResponse;
  statusCode: number;
  body: string;
}): Promise<void> {
  const { server, sockets, req, res, statusCode, body } = args;
  req.socket.setKeepAlive(false);
  res.shouldKeepAlive = false;
  res.writeHead(statusCode, {
    "Content-Type": "text/html",
    Connection: "close",
  });
  await new Promise<void>((resolve) => {
    res.end(body, () => resolve());
  });
  await closeServer({ server, sockets });
}

export function waitForCallback(port: number, timeoutMs = 120_000): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<Socket>();
    const timer = setTimeout(() => {
      server.close();
      for (const socket of sockets) {
        socket.destroy();
      }
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
        void sendCallbackResponse({
          server,
          sockets,
          req,
          res,
          statusCode: 200,
          body: authErrorHtml(description),
        }).finally(() => {
          reject(new Error(`Authentication failed: ${description}`));
        });
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        clearTimeout(timer);
        void sendCallbackResponse({
          server,
          sockets,
          req,
          res,
          statusCode: 400,
          body: "Missing auth code",
        }).finally(() => {
          reject(new Error("Authentication callback missing auth code."));
        });
        return;
      }

      clearTimeout(timer);

      resolve({
        code,
        sendSuccess: () => sendCallbackResponse({
          server,
          sockets,
          req,
          res,
          statusCode: 200,
          body: AUTH_SUCCESS_HTML,
        }),
        sendError: (message: string) => sendCallbackResponse({
          server,
          sockets,
          req,
          res,
          statusCode: 500,
          body: authErrorHtml(message),
        }),
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

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => {
        sockets.delete(socket);
      });
    });

    server.listen(port, "127.0.0.1");
    // Allow the process to exit naturally even if the server is still listening.
    server.unref();
  });
}

export interface TokenExchangeResult {
  token: string;
  expiresAt: string;
}

export async function exchangeCodeForToken(
  code: string,
  port: number,
  options?: { expiresInSeconds?: number; codeVerifier?: string },
): Promise<TokenExchangeResult> {
  const baseUrl = getAuthBaseUrl();
  const redirectUri = `http://localhost:${port}${AUTH_CALLBACK_PATH}`;

  const body: Record<string, unknown> = {
    code,
    redirect_uri: redirectUri,
  };
  if (options?.expiresInSeconds) {
    body.expires_in_seconds = options.expiresInSeconds;
  }
  if (options?.codeVerifier) {
    body.code_verifier = options.codeVerifier;
  }

  const response = await fetch(`${baseUrl}/api/cli/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error || `Token exchange failed (HTTP ${response.status})`,
    );
  }

  const data = (await response.json()) as {
    authToken: string;
    expiresAt: string;
    expiresInSeconds: number;
  };
  if (!data.authToken) {
    throw new Error("Token exchange response missing authToken");
  }
  return { token: data.authToken, expiresAt: data.expiresAt };
}

/**
 * Runs the full browser login flow: bind server, open browser, exchange code.
 * Returns the token and expiry. Caller is responsible for saving to config.
 */
export async function performBrowserLogin(
  port = AUTH_PORT,
  options?: { expiresInSeconds?: number },
): Promise<TokenExchangeResult> {
  // PKCE: generate verifier/challenge pair to bind code to this CLI instance
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  const loginUrl = getLoginUrl(port, codeChallenge);
  const callbackPromise = waitForCallback(port);
  openBrowser(loginUrl);
  const callback = await callbackPromise;
  try {
    const result = await exchangeCodeForToken(callback.code, port, {
      expiresInSeconds: options?.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS,
      codeVerifier,
    });
    await callback.sendSuccess();
    return result;
  } catch (err) {
    await callback.sendError("Failed to complete authentication. Please try again.");
    throw err;
  }
}

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

export { AUTH_PORT, DEFAULT_EXPIRES_IN_SECONDS };
