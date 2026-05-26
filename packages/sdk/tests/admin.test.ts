import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAlchemyAdminClient,
  createGasManagerPolicy,
  deleteWebhook,
  listGasManagerPolicies,
  listWebhooks,
} from "../src/admin/index.js";

const POLICY = {
  policyId: "policy_123",
  appId: "app_123",
  status: "active",
  policyName: "Default Policy",
  policyType: "sponsorship",
  networks: ["ETH_MAINNET"],
};

describe("SDK Admin API extended clients", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.ALCHEMY_GAS_MANAGER_BASE_URL = "https://gas.example.com/";
    process.env.ALCHEMY_NOTIFY_API_BASE_URL = "https://notify.example.com/api/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ALCHEMY_GAS_MANAGER_BASE_URL;
    delete process.env.ALCHEMY_NOTIFY_API_BASE_URL;
  });

  it("routes Gas Manager policy requests with auth headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { policies: [POLICY], before: null, after: null } }), { status: 200 }),
    );

    await expect(listGasManagerPolicies("auth-token", { appId: "app_123", limit: 10 })).resolves.toEqual({
      policies: [POLICY],
      before: null,
      after: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gas.example.com/api/gasManager/policies?appId=app_123&limit=10",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer auth-token",
          "x-alchemy-client-breadcrumb": "alchemy-sdk",
        }),
      }),
    );
  });

  it("creates Gas Manager policies using the API payload shape", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { policy: POLICY } }), { status: 200 }),
    );

    await expect(
      createGasManagerPolicy("auth-token", {
        appId: "app_123",
        policyName: "Default Policy",
        policyType: "sponsorship",
        networks: ["ETH_MAINNET"],
        rules: { maxSpendUsd: "10" },
      }),
    ).resolves.toEqual(POLICY);

    expect(fetchMock.mock.calls[0][0]).toBe("https://gas.example.com/api/gasManager/policy");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      appId: "app_123",
      policyName: "Default Policy",
      policyType: "sponsorship",
      networks: ["ETH_MAINNET"],
      rules: { maxSpendUsd: "10" },
    });
  });

  it("routes Notify webhook requests with webhook API key headers", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ webhooks: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 }));

    await expect(listWebhooks("webhook-key")).resolves.toEqual({ webhooks: [] });
    await expect(deleteWebhook("webhook-key", "wh_123")).resolves.toEqual({ deleted: true });

    expect(fetchMock.mock.calls[0][0]).toBe("https://notify.example.com/api/team-webhooks");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "X-Alchemy-Token": "webhook-key",
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://notify.example.com/api/delete-webhook?webhook_id=wh_123");
  });

  it("creates configured admin clients with per-request overrides", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { policies: [POLICY], before: null, after: null } }), { status: 200 }),
    );

    const adminClient = createAlchemyAdminClient({
      gasManagerApiBaseUrl: "https://gas.example.com",
      breadcrumb: "configured-client",
    });

    await adminClient.listGasManagerPolicies(
      "auth-token",
      { appId: "app_123" },
      { breadcrumb: "request-client" },
    );

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "x-alchemy-client-breadcrumb": "request-client",
    });
  });
});
