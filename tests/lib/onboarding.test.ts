import { describe, expect, it } from "vitest";
import { getSetupStatus, isSetupComplete } from "../../src/lib/onboarding.js";

describe("onboarding setup predicates", () => {
  it("is complete with api key", () => {
    const status = getSetupStatus({ api_key: "api_test" });
    expect(isSetupComplete({ api_key: "api_test" })).toBe(true);
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("api_key");
    expect(status.capabilities.rpc_data).toMatchObject({
      complete: true,
      satisfiedBy: "api_key",
    });
    expect(status.capabilities.admin_api.complete).toBe(false);
  });

  it("is complete with access key and app", () => {
    const status = getSetupStatus({
      access_key: "access_test",
      app: { id: "app_1", name: "Main App", apiKey: "api_from_app" },
    });
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("access_key_app");
  });

  it("is complete with x402 enabled and wallet key file", () => {
    const status = getSetupStatus({
      x402: true,
      wallet_key_file: "/tmp/wallet.txt",
    });
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("x402_wallet");
  });

  it("returns remediation data when incomplete", () => {
    const status = getSetupStatus({});
    expect(status.complete).toBe(false);
    expect(status.satisfiedBy).toBeNull();
    expect(status.missing.length).toBeGreaterThan(0);
    expect(status.capabilities.notify_webhooks).toMatchObject({
      complete: false,
      missing: ["webhook API key"],
    });
    expect(status.nextCommands).toContain(
      "alchemy config set access-key <key> && alchemy config set app <app-id>",
    );
  });
});
