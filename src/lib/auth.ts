import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { URL } from "node:url";

const AUTH_PORT = 16424;
const AUTH_CALLBACK_PATH = "/callback";
/** Default token TTL: 90 days in seconds. */
const DEFAULT_EXPIRES_IN_SECONDS = 90 * 24 * 60 * 60;

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><title>Alchemy CLI</title><style>
  body { font-family: -apple-system, system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
  .card { text-align: center; padding: 3rem; }
  .check { font-size: 3rem; margin-bottom: 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { color: #888; margin: 0; }
</style></head>
<body><div class="card">
  <div class="check">&#x2713;</div>
  <h1>Authenticated</h1>
  <p>You can close this tab and return to your terminal.</p>
</div></body>
</html>`;

// Environment-based auth URL
function getAuthBaseUrl(): string {
  return process.env.ALCHEMY_AUTH_URL || "https://auth.alchemy.com";
}

export function getLoginUrl(port: number): string {
  const base = getAuthBaseUrl();
  const redirect = encodeURIComponent(`http://localhost:${port}${AUTH_CALLBACK_PATH}`);
  return `${base}/login?redirectUrl=${redirect}`;
}

export function openBrowser(url: string): void {
  const cmd =
    platform() === "darwin"
      ? "open"
      : platform() === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

interface CallbackResult {
  code: string;
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

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing auth code");
        return;
      }

      clearTimeout(timer);

      resolve({
        code,
        sendSuccess: () => {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(SUCCESS_HTML);
          server.close();
        },
        sendError: (message: string) => {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<!DOCTYPE html><html><head><title>Alchemy CLI</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa}.card{text-align:center;padding:3rem}.x{font-size:3rem;margin-bottom:1rem;color:#ef4444}h1{font-size:1.5rem;margin:0 0 .5rem}p{color:#888;margin:0}</style></head><body><div class="card"><div class="x">&#x2717;</div><h1>Authentication Failed</h1><p>${message}</p></div></body></html>`);
          server.close();
        },
      });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
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

    server.listen(port);
  });
}

export interface TokenExchangeResult {
  token: string;
  expiresAt: string;
}

export async function exchangeCodeForToken(
  code: string,
  port: number,
  options?: { expiresInSeconds?: number },
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

export async function revokeToken(token: string): Promise<void> {
  const baseUrl = getAuthBaseUrl();
  const response = await fetch(`${baseUrl}/api/cli/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ||
        `Token revocation failed (HTTP ${response.status})`,
    );
  }
}

export { AUTH_PORT, DEFAULT_EXPIRES_IN_SECONDS };
