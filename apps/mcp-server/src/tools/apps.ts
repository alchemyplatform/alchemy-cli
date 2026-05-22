import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import { getApp, listApps, createApp, updateApp } from "../clients/admin.js";
import { getRedisClient } from "../redis.js";
import { hashToken } from "../auth.js";
import { requireAuth, toolResult, handleToolError, maskApiKey } from "./helpers.js";

const REDIS_APP_PREFIX = "app:";

export function registerAppTools(server: InstrumentedServer): void {
  server.tool(
    "list_apps",
    "Lists Alchemy apps for the authenticated user. Returns app_id, name, and description. Paginated via cursor. Call this first to discover app IDs needed by get_app, select_app, and update_app.",
    {
      limit: z.number().int().positive().max(25).default(25).describe("Max results per page (1-25, default 25)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous response"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ limit, cursor }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const result = await listApps(token, { limit, cursor });

        if (result.apps.length === 0) return toolResult("No apps found.");

        const lines = result.apps.map(
          (app) => `${app.id} — ${app.name}${app.description ? ` (${app.description})` : ""}`,
        );
        if (result.cursor) {
          lines.push(`\nMore apps available. Call list_apps with cursor: "${result.cursor}"`);
        }
        return toolResult(lines.join("\n"));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "get_app",
    "Gets detailed information about an Alchemy app including networks, masked API key, and allowlists. Requires an app_id from list_apps.",
    {
      app_id: z.string().describe("The Alchemy app ID"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ app_id }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const app = await getApp(token, app_id);
        const networks = app.chainNetworks.map((n) => `  ${n.id} — ${n.name}`).join("\n");
        const text = [
          `Name: ${app.name}`,
          `ID: ${app.id}`,
          app.description ? `Description: ${app.description}` : null,
          `API Key: ${maskApiKey(app.apiKey)} (view at https://dashboard.alchemy.com/apps/${app.id})`,
          `Created: ${app.createdAt}`,
          `Networks:\n${networks}`,
          app.addressAllowlist?.length ? `Address Allowlist: ${app.addressAllowlist.map((a) => a.value).join(", ")}` : null,
          app.originAllowlist?.length ? `Origin Allowlist: ${app.originAllowlist.map((a) => a.value).join(", ")}` : null,
          app.ipAllowlist?.length ? `IP Allowlist: ${app.ipAllowlist.map((a) => a.value).join(", ")}` : null,
        ].filter(Boolean).join("\n");
        return toolResult(text);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "select_app",
    "Selects an Alchemy app and caches its API key for use by other tools. If only one app exists, auto-select it. If multiple apps exist, always ask the user which one to use first.",
    {
      app_id: z.string().describe("The Alchemy app ID to select"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ app_id }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const app = await getApp(token, app_id);
        const redis = getRedisClient();
        const APP_CACHE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
        await redis.set(
          `${REDIS_APP_PREFIX}${hashToken(token)}`,
          JSON.stringify({ apiKey: app.apiKey, appId: app.id, appName: app.name }),
          "EX",
          APP_CACHE_TTL_SECONDS,
        );
        return toolResult(`Selected app "${app.name}" (${app.id}). API key cached.`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "create_app",
    "Creates a new Alchemy app. Requires a name and at least one network ID. Use list_chains to discover valid network IDs.",
    {
      name: z.string().describe("Name for the new app"),
      chain_networks: z.array(z.string()).describe("Network IDs (e.g. ['ETH_MAINNET']). Use list_chains to find IDs."),
      description: z.string().optional().describe("Optional app description"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ name, chain_networks, description }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const app = await createApp(token, { name, networkAllowlist: chain_networks, description });
        return toolResult(`Created app "${app.name}" (${app.id})\nAPI Key: ${maskApiKey(app.apiKey)} (view at https://dashboard.alchemy.com/apps/${app.id})`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "update_app",
    "Updates an Alchemy app's name or description. At least one field must be provided.",
    {
      app_id: z.string().describe("The Alchemy app ID to update"),
      name: z.string().optional().describe("New app name"),
      description: z.string().optional().describe("New app description"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ app_id, name, description }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const app = await updateApp(token, app_id, { name, description });
        return toolResult(`Updated app "${app.name}" (${app.id})`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // delete_app removed — too destructive for an LLM tool.
  // App deletion can be done via the Alchemy Dashboard.
}
