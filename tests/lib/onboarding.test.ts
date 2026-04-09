import { describe, expect, it } from "vitest";
import { getSetupStatus, isSetupComplete } from "../../src/lib/onboarding.js";

describe("onboarding setup predicates", () => {
  it("is complete with api key", async () => {
    const status = await getSetupStatus({ api_key: "api_test" });
    expect(await isSetupComplete({ api_key: "api_test" })).toBe(true);
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("api_key");
  });

  it("is complete with access key and app", async () => {
    const status = await getSetupStatus({
      access_key: "access_test",
      app: { id: "app_1", name: "Main App", apiKey: "api_from_app" },
    });
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("access_key_app");
  });

  it("is complete with x402 enabled and wallet key file", async () => {
    const status = await getSetupStatus({
      x402: true,
      wallet_key_file: "/tmp/wallet.txt",
    });
    expect(status.complete).toBe(true);
    expect(status.satisfiedBy).toBe("x402_wallet");
  });

  it("returns remediation data when incomplete", async () => {
    const status = await getSetupStatus({});
    expect(status.complete).toBe(false);
    expect(status.satisfiedBy).toBeNull();
    expect(status.missing.length).toBeGreaterThan(0);
    expect(status.nextCommands.length).toBeGreaterThan(0);
  });
});
