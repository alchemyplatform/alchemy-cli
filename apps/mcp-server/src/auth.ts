import type { Request, Response, NextFunction } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import crypto from "node:crypto";
import { getRedisClient } from "./redis.js";
import { fetchUserFromAuthToken } from "./clients/authchemy.js";
import { authFailuresTotal, authSuccessTotal, errorsTotal } from "./metrics.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo;
    }
  }
}

const AUTH_CACHE_TTL_SECONDS = 60;
const REDIS_AUTH_PREFIX = "auth:";

/** SHA-256 hash a token so raw tokens are never stored as Redis keys. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Validates the auth token by checking Redis cache first, then falling back
 * to Authchemy's fetchUserFromAuthToken endpoint.
 * Returns AuthInfo if valid, null if invalid/expired.
 */
async function validateToken(
  token: string,
  requestIp?: string,
): Promise<AuthInfo | null> {
  if (!token) return null;

  const redis = getRedisClient();
  const hashed = hashToken(token);
  const cacheKey = `${REDIS_AUTH_PREFIX}${hashed}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return { token, clientId: "authenticated-client", scopes: [] };
  }

  // Validate via Authchemy
  const user = await fetchUserFromAuthToken(token, requestIp);
  if (!user) {
    // Token is invalid/expired — also clear any stale app selection
    await redis.del(`app:${hashed}`);
    return null;
  }

  // Cache successful auth validation with TTL
  await redis.set(cacheKey, JSON.stringify({ userId: user.id, email: user.email }), "EX", AUTH_CACHE_TTL_SECONDS);

  return { token, clientId: "authenticated-client", scopes: [] };
}

/**
 * Express middleware that validates Bearer tokens from the Authorization header.
 * Checks Redis cache first, then validates via Authchemy.
 */
export function requireBearerAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      authFailuresTotal.inc({ reason: "missing_token" });
      const resourceUrl =
        process.env.MCP_RESOURCE_URL ??
        `https://mcp.${process.env.ALCHEMY_BASE_DOMAIN ?? "alchemy.com"}`;
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceUrl}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid Authorization header" },
        id: null,
      });
      return;
    }

    const token = authHeader.slice(7);
    const requestIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress;

    try {
      const authInfo = await validateToken(token, requestIp);
      if (!authInfo) {
        authFailuresTotal.inc({ reason: "invalid_token" });
        res.status(403).json({
          jsonrpc: "2.0",
          error: { code: -32002, message: "Invalid or expired token" },
          id: null,
        });
        return;
      }

      authSuccessTotal.inc();
      req.auth = authInfo;
      next();
    } catch (err) {
      errorsTotal.inc({ type: "auth_error" });
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "Token validation error",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal authentication error" },
        id: null,
      });
    }
  };
}
