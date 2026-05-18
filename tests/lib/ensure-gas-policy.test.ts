import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

function setupMocks(opts: {
  sponsored: boolean;
  policyId?: string;
  interactive: boolean;
  hasAdmin: boolean;
  selectResult?: string | null;
}) {
  const selectOrCreatePolicy = vi.fn().mockResolvedValue(opts.selectResult ?? null);
  vi.doMock("../../src/lib/policy-prompt.js", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../../src/lib/policy-prompt.js");
    return { ...actual, selectOrCreatePolicy };
  });
  vi.doMock("../../src/lib/resolve.js", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../../src/lib/resolve.js");
    return {
      ...actual,
      resolveGasSponsored: () => opts.sponsored,
      resolveGasPolicyId: () => opts.policyId,
      hasAuthLoginToken: () => opts.hasAdmin,
      resolveNetwork: () => "eth-mainnet",
    };
  });
  vi.doMock("../../src/lib/interaction.js", () => ({
    isInteractiveAllowed: () => opts.interactive,
  }));
  vi.doMock("../../src/lib/config.js", () => ({
    load: () => ({}),
    save: vi.fn(),
  }));
  return { selectOrCreatePolicy };
}

describe("ensureGasPolicyResolved", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.ALCHEMY_EVM_GAS_POLICY_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("is a no-op when --gas-sponsored is not set", async () => {
    const { selectOrCreatePolicy } = setupMocks({
      sponsored: false,
      interactive: true,
      hasAdmin: true,
    });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    await ensureGasPolicyResolved(new Command());
    expect(selectOrCreatePolicy).not.toHaveBeenCalled();
  });

  it("is a no-op when a policy ID is already resolved", async () => {
    const { selectOrCreatePolicy } = setupMocks({
      sponsored: true,
      policyId: "0xset",
      interactive: true,
      hasAdmin: true,
    });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    await ensureGasPolicyResolved(new Command());
    expect(selectOrCreatePolicy).not.toHaveBeenCalled();
  });

  it("throws sponsorship error in non-interactive mode", async () => {
    setupMocks({ sponsored: true, interactive: false, hasAdmin: true });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    await expect(ensureGasPolicyResolved(new Command())).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message: expect.stringContaining("gas-manager policy list"),
    });
  });

  it("throws AUTH_REQUIRED with 'alchemy auth login' hint when not logged in", async () => {
    setupMocks({ sponsored: true, interactive: true, hasAdmin: false });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    await expect(ensureGasPolicyResolved(new Command())).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      message: expect.stringContaining("alchemy auth login"),
    });
  });

  it("runs the prompt and returns the resolved policy ID", async () => {
    const { selectOrCreatePolicy } = setupMocks({
      sponsored: true,
      interactive: true,
      hasAdmin: true,
      selectResult: "0xprompted",
    });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    const result = await ensureGasPolicyResolved(new Command());

    expect(selectOrCreatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ flavor: "sponsorship", network: "eth-mainnet" }),
    );
    expect(result).toBe("0xprompted");
    // The helper no longer mutates env — env stays untouched.
    expect(process.env.ALCHEMY_EVM_GAS_POLICY_ID).toBeUndefined();
  });

  it("returns the existing policy id without prompting when one is set", async () => {
    const { selectOrCreatePolicy } = setupMocks({
      sponsored: true,
      policyId: "0xpreset",
      interactive: true,
      hasAdmin: true,
    });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    const result = await ensureGasPolicyResolved(new Command());
    expect(result).toBe("0xpreset");
    expect(selectOrCreatePolicy).not.toHaveBeenCalled();
  });

  it("throws when the user cancels the prompt", async () => {
    setupMocks({
      sponsored: true,
      interactive: true,
      hasAdmin: true,
      selectResult: null,
    });
    const { ensureGasPolicyResolved } = await import("../../src/lib/smart-wallet.js");
    await expect(ensureGasPolicyResolved(new Command())).rejects.toMatchObject({
      code: "INVALID_ARGS",
    });
  });
});
