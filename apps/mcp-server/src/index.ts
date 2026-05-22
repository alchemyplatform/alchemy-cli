import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "./auth.js";
import { initRedis, shutdownRedis } from "./redis.js";
import { createMcpServer } from "./server.js";
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  errorsTotal,
} from "./metrics.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
app.use(express.json());

// ---------- CORS (required for ChatGPT cross-origin MCP requests) ----------

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ---------- Request logging + metrics ----------

app.use((req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      Number(process.hrtime.bigint() - start) / 1_000_000;
    const durationSec = durationMs / 1000;
    const path = req.route?.path ?? req.path;
    const status = String(res.statusCode);

    // Metrics
    httpRequestsTotal.inc({ method: req.method, path, status });
    httpRequestDuration.observe({ method: req.method, path, status }, durationSec);

    // Structured log (skip health checks to reduce noise)
    if (path !== "/health" && path !== "/metrics") {
      const log: Record<string, unknown> = {
        ts: new Date().toISOString(),
        method: req.method,
        path,
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
      };

      // Include user info if authenticated
      const userId = (req as any).auth?.extra?.userId;
      if (userId) {
        log.user_id = userId;
      }

      if (res.statusCode >= 500) {
        console.error(JSON.stringify(log));
      } else if (res.statusCode >= 400) {
        console.warn(JSON.stringify(log));
      } else {
        console.log(JSON.stringify(log));
      }
    }
  });

  next();
});

// ---------- Auth ----------

const authMiddleware = requireBearerAuth();

// ---------- MCP Endpoint ----------

app.post("/mcp", authMiddleware, async (req, res) => {
  // Stateless mode: no session ID is issued or validated, so every request is
  // self-contained and can land on any pod behind the load balancer. This works
  // because our MCP server has no per-session state — it only registers tools.
  //
  // TODO: If we ever need server-initiated notifications (e.g. long-running job
  // progress) or per-session state, switch back to stateful sessions with Redis-
  // backed session storage and consistent routing (e.g. Istio session affinity).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", authMiddleware, async (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "SSE streams not supported in stateless mode" },
    id: null,
  });
});

app.delete("/mcp", authMiddleware, async (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Session deletion not applicable in stateless mode" },
    id: null,
  });
});

// ---------- OAuth Discovery ----------

const baseDomain = process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com";
const authServerUrl =
  process.env.MCP_AUTH_SERVER_URL ?? `https://auth.${baseDomain}`;
const mcpResourceUrl =
  process.env.MCP_RESOURCE_URL ?? `https://mcp.${baseDomain}/mcp`;
const OPENAI_APP_DOMAIN_VERIFICATION_TOKEN =
  "V7tx9braDvDldLFyBv69FQhEVpkr-c_CuuFOl1yg2rg";

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: mcpResourceUrl,
    authorization_servers: [authServerUrl],
    bearer_methods_supported: ["header"],
  });
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: authServerUrl,
    authorization_endpoint: `${authServerUrl}/oauth/authorize`,
    token_endpoint: `${authServerUrl}/oauth/token`,
    registration_endpoint: `${authServerUrl}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["offline_access"],
  });
});

app.get("/.well-known/openai-apps-challenge", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("text/plain").send(OPENAI_APP_DOMAIN_VERIFICATION_TOKEN);
});

// ---------- Metrics server (separate port, not exposed via ingress) ----------

const METRICS_PORT = parseInt(process.env.METRICS_PORT ?? "9090", 10);
const metricsApp = express();
metricsApp.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

// ---------- Health Check ----------

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---------- Global error handler ----------

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    errorsTotal.inc({ type: err.name || "UnknownError" });
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        error: err.message,
        stack: err.stack,
      }),
    );
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
  },
);

// ---------- Startup ----------

async function main(): Promise<void> {
  if (!process.env.ALCHEMY_BASE_DOMAIN) {
    throw new Error("ALCHEMY_BASE_DOMAIN environment variable is required");
  }

  await initRedis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true",
  });

  app.listen(PORT, () => {
    console.log(`Alchemy MCP server listening on port ${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  });

  metricsApp.listen(METRICS_PORT, () => {
    console.log(`Metrics server listening on port ${METRICS_PORT}`);
  });
}

async function shutdown(): Promise<void> {
  console.log("Shutting down...");
  await shutdownRedis();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
