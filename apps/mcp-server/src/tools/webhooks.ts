import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import { mcpAdminClient } from "../clients/admin.js";
import {
  requireAuth,
  getSelectedApp,
  toolResult,
  handleToolError,
  formatResult,
  AppNotSelectedError,
  WebhookApiKeyUnavailableError,
} from "./helpers.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

async function resolveWebhookApiKey(
  authInfo: { token?: string } | undefined,
  appId?: string,
): Promise<string> {
  const token = requireAuth(authInfo);
  const selectedApp = appId ? null : await getSelectedApp(authInfo);
  const resolvedAppId = appId ?? selectedApp?.appId;
  if (!resolvedAppId) throw new AppNotSelectedError();

  if (selectedApp?.webhookApiKey) return selectedApp.webhookApiKey;

  const app = await mcpAdminClient.getApp(token, resolvedAppId);
  if (!app.webhookApiKey) throw new WebhookApiKeyUnavailableError(resolvedAppId);
  return app.webhookApiKey;
}

export function registerWebhookTools(server: InstrumentedServer): void {
  server.tool(
    "list_webhooks",
    "Lists Notify webhooks for an app. Use select_app first or pass app_id. Returns the raw Notify API response.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
    },
    READ_ONLY,
    async ({ app_id }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.listWebhooks(webhookApiKey);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "create_webhook",
    "Creates a Notify webhook for an app. Pass the Notify API create-webhook JSON body exactly as documented. Use list_webhooks after creation to verify.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      body: z.record(z.string(), z.unknown()).describe("Create webhook JSON payload accepted by the Notify API."),
    },
    WRITE,
    async ({ app_id, body }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.createWebhook(webhookApiKey, body);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "update_webhook",
    "Updates a Notify webhook for an app. Pass the Notify API update-webhook JSON body exactly as documented.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      body: z.record(z.string(), z.unknown()).describe("Update webhook JSON payload accepted by the Notify API."),
    },
    WRITE,
    async ({ app_id, body }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.updateWebhook(webhookApiKey, body);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "delete_webhook",
    "Deletes a Notify webhook by webhook_id. This is destructive; only call after the user explicitly confirms the webhook_id.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      webhook_id: z.string().describe("Notify webhook ID to delete."),
    },
    DESTRUCTIVE,
    async ({ app_id, webhook_id }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.deleteWebhook(webhookApiKey, webhook_id);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "get_webhook_addresses",
    "Gets address activity filters for a Notify webhook. Use list_webhooks first to find webhook_id.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      webhook_id: z.string().describe("Notify webhook ID."),
    },
    READ_ONLY,
    async ({ app_id, webhook_id }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.getWebhookAddresses(webhookApiKey, webhook_id);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "get_webhook_nft_filters",
    "Gets NFT activity filters for a Notify webhook. Use list_webhooks first to find webhook_id.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      webhook_id: z.string().describe("Notify webhook ID."),
    },
    READ_ONLY,
    async ({ app_id, webhook_id }, { authInfo }) => {
      try {
        const webhookApiKey = await resolveWebhookApiKey(authInfo, app_id);
        const result = await mcpAdminClient.getWebhookNftFilters(webhookApiKey, webhook_id);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
