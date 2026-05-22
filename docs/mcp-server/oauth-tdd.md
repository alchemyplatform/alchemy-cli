# Alchemy MCP Server — Technical Design Document

## Overview

The Alchemy MCP Server exposes Alchemy's admin APIs as MCP tools, enabling AI clients (Claude Code, Claude Desktop, etc.) to manage apps, allowlists, and chains via natural language. Authentication uses OAuth 2.1 with PKCE, leveraging authchemy's existing login flow.

## Infrastructure Architecture

```mermaid
graph TB
    subgraph Clients
        CC[Claude Code]
        CD[Claude Desktop]
        Other[Other MCP Clients]
    end

    subgraph Cloudflare
        CF_MCP[mcp.alchemy.com<br/>DNS + Proxy + Rate Limiting]
        CF_Auth[auth.alchemy.com<br/>DNS + Proxy + Rate Limiting]
    end

    subgraph AWS
        subgraph computev2[computev2 Cluster]
            subgraph MCP_NS[ns-agent-experience-alchemy-mcp-server]
                Istio[Istio Ingress Gateway]
                MCP1[MCP Server Pod 1]
                MCP2[MCP Server Pod 2]
                Redis[(ElastiCache Redis<br/>Auth token cache)]
            end
        end

        subgraph ECS[ECS Cluster]
            ALB_Auth[ALB<br/>Cognito SSO on staging<br/>OAuth paths bypassed]
            Authchemy[Authchemy<br/>Login UI + OAuth endpoints]
            AuthRedis[(Redis<br/>Auth codes + sessions)]
        end

        AdminAPI[Admin API<br/>admin-api.alchemy.com<br/>Token validation + App CRUD]
    end

    CC --> CF_MCP
    CD --> CF_MCP
    Other --> CF_MCP
    CC --> CF_Auth
    CD --> CF_Auth

    CF_MCP --> Istio
    Istio --> MCP1
    Istio --> MCP2
    MCP1 --> Redis
    MCP2 --> Redis
    MCP1 --> AdminAPI
    MCP2 --> AdminAPI

    CF_Auth --> ALB_Auth
    ALB_Auth --> Authchemy
    Authchemy --> AuthRedis
```

## Request Flow — Tool Call (Authenticated)

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant CF as Cloudflare<br/>(mcp.alchemy.com)
    participant Istio as Istio Gateway
    participant MCP as MCP Server Pod
    participant Redis as ElastiCache Redis
    participant Admin as Admin API

    Client->>CF: POST /mcp + Bearer token
    CF->>Istio: forward
    Istio->>MCP: route (LEAST_REQUEST)
    MCP->>Redis: check auth cache
    alt cache hit
        Redis-->>MCP: valid
    else cache miss
        MCP->>Admin: listApps(token, limit=1)
        Admin-->>MCP: 200 OK
        MCP->>Redis: cache token (60s TTL)
    end
    MCP->>Admin: execute tool (e.g. list apps, update allowlist)
    Admin-->>MCP: result
    MCP-->>Client: JSON-RPC response via SSE
```

## Request Flow — OAuth Authentication

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant MCP as MCP Server
    participant Auth as Authchemy
    participant Browser

    Note over Client,Auth: 1. Discovery
    Client->>MCP: GET /mcp (no token)
    MCP-->>Client: 401 + WWW-Authenticate header
    Client->>MCP: GET /.well-known/oauth-authorization-server
    MCP-->>Client: {endpoints, registration_endpoint}

    Note over Client,Auth: 2. Client Registration
    Client->>Auth: POST /oauth/register
    Auth-->>Client: {client_id}

    Note over Client,Auth: 3. Browser Login (PKCE)
    Client->>Client: generate code_verifier + code_challenge
    Client->>Browser: open /oauth/authorize
    Browser->>Auth: GET /oauth/authorize
    Auth->>Browser: redirect to /login
    Browser->>Auth: user logs in + approves
    Auth-->>Browser: redirect to callback?code=...
    Browser-->>Client: authorization code

    Note over Client,Auth: 4. Token Exchange
    Client->>Auth: POST /oauth/token (code + code_verifier)
    Auth-->>Client: {access_token, expires_in}

    Note over Client,Auth: 5. Ready
    Client->>MCP: POST /mcp + Bearer token
    MCP-->>Client: tool calls work
```

## Components

| Component | Stack | Role |
|-----------|-------|------|
| **MCP Server** | Node.js / Express on computev2 (Istio mesh) | Stateless MCP endpoint. Serves OAuth discovery metadata, validates tokens via Admin API (cached in Redis), executes tool calls. 2 replicas prod, 1 staging. |
| **Authchemy** | Node.js / Express + Gatsby on ECS | Alchemy's auth service. Handles user login (email/password, Google SSO), session management. New `/oauth/*` endpoints wrap the existing PKCE flow with standard OAuth 2.1 response formats. |
| **Admin API** | Internal service | Alchemy's admin API for app management. MCP server proxies tool calls here. Also used for token validation (`listApps` with limit=1). |
| **Redis (MCP)** | ElastiCache | Caches validated auth tokens (60s TTL) to avoid hitting Admin API on every request. |
| **Redis (Auth)** | ElastiCache | Stores PKCE auth codes (60s TTL) and sessions. |
| **Cloudflare** | CDN/Proxy | DNS, TLS termination, rate limiting for both `mcp.alchemy.com` and `auth.alchemy.com`. |
| **ALB** | AWS ALB | Routes to authchemy ECS tasks. On staging, enforces Cognito SSO with bypass rules for OAuth paths. No SSO on prod. |
| **Istio** | Service mesh on computev2 | Ingress gateway + sidecar proxies for MCP server. Handles TLS, load balancing (LEAST_REQUEST), canary deployments. |

## MCP Server Design

- **Stateless**: Each request creates a fresh `StreamableHTTPServerTransport` with no session ID. Any pod can handle any request — no session affinity needed.
- **Transport**: MCP Streamable HTTP (POST request → SSE response per tool call). No long-lived connections.
- **Auth**: Bearer token validated against Admin API, cached in Redis. OAuth discovery metadata served from the MCP server itself.

## Token Lifecycle

| Phase | Token Type | TTL | Storage |
|-------|-----------|-----|---------|
| **Current** | Auth token as access_token | 90 days | macOS Keychain (Claude Code) / Anthropic servers (Claude Desktop) |
| **Future** | Short-lived access_token | ~1 hour | Client-side |
| **Future** | Refresh token | 90 days | Client-side + DB |

## Security

- **PKCE (S256)** required — no client secrets stored
- **Token validation** on every MCP request via Admin API (cached 60s)
- **Cloudflare rate limiting** on all auth endpoints
- **CSRF exemption** for OAuth endpoints only (no browser sessions)
- **ALB SSO bypass** scoped to exact OAuth paths (`/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/.well-known/oauth-authorization-server`)
- **No public internet exposure** — MCP server behind Cloudflare Zero Trust (WARP required)
