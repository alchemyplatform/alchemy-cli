import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpAdminClient = {
  getApp: vi.fn(),
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  getWebhookAddresses: vi.fn(),
  getWebhookNftFilters: vi.fn(),
};

vi.mock("../../src/clients/admin.js", () => ({
  mcpAdminClient,
}));

const { registerWebhookTools } = await import("../../src/tools/webhooks.js");

function webhookTool(name: string) {
  const tools = new Map<string, (...args: any[]) => Promise<any>>();
  registerWebhookTools({
    tool(toolName: string, _description: string, _schema: unknown, _annotations: unknown, handler: (...args: any[]) => Promise<any>) {
      tools.set(toolName, handler);
    },
  } as never);
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function text(result: { content: Array<{ text: string }> }): string {
  return result.content[0].text;
}

describe("webhook tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists webhooks using the selected app webhook API key", async () => {
    mcpAdminClient.getApp.mockResolvedValueOnce({
      id: "app_123",
      webhookApiKey: "webhook-key",
    });
    mcpAdminClient.listWebhooks.mockResolvedValueOnce({ webhooks: [{ id: "wh_123" }] });

    const result = await webhookTool("list_webhooks")(
      { app_id: "app_123" },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.getApp).toHaveBeenCalledWith("auth-token", "app_123");
    expect(mcpAdminClient.listWebhooks).toHaveBeenCalledWith("webhook-key");
    expect(text(result)).toContain("wh_123");
  });

  it("creates webhooks with caller-provided Notify payloads", async () => {
    mcpAdminClient.getApp.mockResolvedValueOnce({
      id: "app_123",
      webhookApiKey: "webhook-key",
    });
    mcpAdminClient.createWebhook.mockResolvedValueOnce({ id: "wh_new" });

    const body = { network: "ETH_MAINNET", webhook_type: "ADDRESS_ACTIVITY" };
    const result = await webhookTool("create_webhook")(
      { app_id: "app_123", body },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.createWebhook).toHaveBeenCalledWith("webhook-key", body);
    expect(text(result)).toContain("wh_new");
  });

  it("marks missing auth as a tool error", async () => {
    const result = await webhookTool("delete_webhook")(
      { app_id: "app_123", webhook_id: "wh_123" },
      { authInfo: undefined },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Not authenticated. Provide a valid Bearer token.");
    expect(mcpAdminClient.deleteWebhook).not.toHaveBeenCalled();
  });
});
