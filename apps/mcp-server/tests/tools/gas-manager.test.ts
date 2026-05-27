import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpAdminClient = {
  listAllGasManagerPolicies: vi.fn(),
  getGasManagerPolicy: vi.fn(),
  createGasManagerPolicy: vi.fn(),
  setGasManagerPolicyStatus: vi.fn(),
};

vi.mock("../../src/clients/admin.js", () => ({
  mcpAdminClient,
}));

const { registerGasManagerTools } = await import("../../src/tools/gas-manager.js");

const POLICY = {
  policyId: "policy_123",
  appId: "app_123",
  status: "active",
  policyName: "Default Policy",
  policyType: "sponsorship",
  networks: ["ETH_MAINNET"],
};

function gasManagerTool(name: string) {
  const tools = new Map<string, (...args: any[]) => Promise<any>>();
  registerGasManagerTools({
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

describe("Gas Manager tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists and filters policies for an app", async () => {
    mcpAdminClient.listAllGasManagerPolicies.mockResolvedValueOnce([
      POLICY,
      { ...POLICY, policyId: "policy_456", status: "inactive" },
    ]);

    const result = await gasManagerTool("list_gas_policies")(
      { app_id: "app_123", limit: 10, status: "active" },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.listAllGasManagerPolicies).toHaveBeenCalledWith("auth-token", {
      appId: "app_123",
      limit: 10,
    });
    expect(text(result)).toContain("policy_123");
    expect(text(result)).not.toContain("policy_456");
  });

  it("normalizes RPC slugs when filtering policies", async () => {
    mcpAdminClient.listAllGasManagerPolicies.mockResolvedValueOnce([
      POLICY,
      { ...POLICY, policyId: "policy_456", networks: ["MONAD_TESTNET"] },
    ]);

    const result = await gasManagerTool("list_gas_policies")(
      { app_id: "app_123", limit: 10, network: "monad-testnet" },
      { authInfo: { token: "auth-token" } },
    );

    expect(text(result)).toContain("policy_456");
    expect(text(result)).not.toContain("policy_123");
  });

  it("creates sponsorship policies using flattened MCP inputs", async () => {
    mcpAdminClient.createGasManagerPolicy.mockResolvedValueOnce(POLICY);

    const result = await gasManagerTool("create_gas_policy")(
      {
        app_id: "app_123",
        policy_name: "Default Policy",
        policy_type: "sponsorship",
        networks: ["ETH_MAINNET"],
        max_spend_usd: "10",
        sender_allowlist: ["0xabc"],
      },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.createGasManagerPolicy).toHaveBeenCalledWith("auth-token", {
      appId: "app_123",
      policyName: "Default Policy",
      policyType: "sponsorship",
      networks: ["ETH_MAINNET"],
      rules: {
        maxSpendUsd: "10",
        senderAllowlist: ["0xabc"],
      },
    });
    expect(text(result)).toContain("Created Gas Manager policy");
  });

  it("normalizes RPC slugs when creating policies", async () => {
    mcpAdminClient.createGasManagerPolicy.mockResolvedValueOnce({
      ...POLICY,
      networks: ["MONAD_TESTNET"],
    });

    await gasManagerTool("create_gas_policy")(
      {
        app_id: "app_123",
        policy_name: "Default Policy",
        policy_type: "sponsorship",
        networks: ["monad-testnet"],
      },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.createGasManagerPolicy).toHaveBeenCalledWith(
      "auth-token",
      expect.objectContaining({
        networks: ["MONAD_TESTNET"],
      }),
    );
  });

  it("updates policy status", async () => {
    mcpAdminClient.setGasManagerPolicyStatus.mockResolvedValueOnce({
      ...POLICY,
      status: "inactive",
    });

    const result = await gasManagerTool("set_gas_policy_status")(
      { policy_id: "policy_123", status: "inactive" },
      { authInfo: { token: "auth-token" } },
    );

    expect(mcpAdminClient.setGasManagerPolicyStatus).toHaveBeenCalledWith(
      "auth-token",
      "policy_123",
      "inactive",
    );
    expect(text(result)).toContain("Status: inactive");
  });
});
