import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { URL } from "node:url";

const AUTH_PORT = 16424;
const AUTH_CALLBACK_PATH = "/callback";

// Environment-based auth URL
function getAuthBaseUrl(): string {
  return process.env.ALCHEMY_AUTH_URL || "https://auth.alchemy.com";
}

export function getLoginUrl(port: number): string {
  const base = getAuthBaseUrl();
  const redirect = encodeURIComponent(`http://localhost:${port}${AUTH_CALLBACK_PATH}`);
  return `${base}/login?redirect=${redirect}`;
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

interface AuthResult {
  token: string;
}

export function waitForCallback(port: number, timeoutMs = 120_000): Promise<AuthResult> {
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

      const token = url.searchParams.get("authToken");
      if (!token) {
        res.writeHead(400);
        res.end("Missing auth token");
        return;
      }

      // Serve success page
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
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
</html>`);

      clearTimeout(timer);
      server.close();
      resolve({ token });
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

export { AUTH_PORT };
