import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import type { Policy } from "../../src/lib/gas-manager-client.js";

const APP_ID = "app-xyz";

function mockConfig(overrides: Record<string, unknown> = {}) {
  const cfg = { app: { id: APP_ID, name: "app", apiKey: "k", webhookApiKey: "w" } };
  const save = vi.fn();
  vi.doMock("../../src/lib/config.js", () => ({
    load: () => ({ ...cfg, ...overrides }),
    save,
    KEY_MAP: {},
  }));
  return { save };
}

function mockUI() {
  vi.doMock("../../src/lib/ui.js", () => ({
    dim: (s: string) => s,
    green: (s: string) => s,
    withSpinner: async (_label: string, _done: string, fn: () => Promise<unknown>) => fn(),
  }));
}

function mockPrompts(opts: {
  autocomplete?: (string | null);
  text?: (string | null);
  confirm?: (boolean | null);
}) {
  const promptAutocomplete = vi.fn().mockResolvedValue(opts.autocomplete ?? null);
  const promptText = vi.fn().mockResolvedValue(opts.text ?? null);
  const promptConfirm = vi.fn().mockResolvedValue(opts.confirm ?? null);
  vi.doMock("../../src/lib/terminal-ui.js", () => ({
    promptAutocomplete,
    promptText,
    promptConfirm,
  }));
  return { promptAutocomplete, promptText, promptConfirm };
}

function makePolicy(over: Partial<Policy> = {}): Policy {
  return {
    policyId: "0xabc",
    appId: APP_ID,
    status: "active",
    policyName: "Default Policy",
    policyType: "sponsorship",
    networks: ["ETH_MAINNET"],
    ...over,
  };
}

function mockGasManagerClient(client: {
  listAllPolicies?: ReturnType<typeof vi.fn>;
  createPolicy?: ReturnType<typeof vi.fn>;
  setPolicyStatus?: ReturnType<typeof vi.fn>;
}) {
  vi.doMock("../../src/lib/resolve.js", async () => {
    const actual = await vi.importActual<Record<string, unknown>>("../../src/lib/resolve.js");
    return {
      ...actual,
      gasManagerClientFromFlags: () => ({
        listAllPolicies: vi.fn().mockResolvedValue([]),
        createPolicy: vi.fn(),
        setPolicyStatus: vi.fn(),
        ...client,
      }),
    };
  });
}

describe("selectOrCreatePolicy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns the picked policy ID and persists when user confirms", async () => {
    const { save } = mockConfig();
    mockUI();
    const { promptAutocomplete, promptConfirm } = mockPrompts({
      autocomplete: "0xabc",
      confirm: true,
    });
    mockGasManagerClient({
      listAllPolicies: vi.fn().mockResolvedValue([
        makePolicy({ policyId: "0xabc", policyName: "Prod" }),
        makePolicy({ policyId: "0xother", policyName: "Other", networks: ["BASE_MAINNET"] }),
      ]),
    });

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    const program = new Command();
    const result = await selectOrCreatePolicy({
      flavor: "sponsorship",
      network: "eth-mainnet",
      program,
    });

    expect(result).toBe("0xabc");
    expect(promptAutocomplete).toHaveBeenCalledTimes(1);
    // Only the matching network's policy is offered + the create-new option.
    const offered = promptAutocomplete.mock.calls[0][0].options.map((o: { value: string }) => o.value);
    expect(offered).toContain("0xabc");
    expect(offered).not.toContain("0xother");
    expect(offered).toContain("__create_new__");
    expect(promptConfirm).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ evm_gas_policy_id: "0xabc" }));
  });

  it("falls through to the create flow when no policies exist", async () => {
    mockConfig();
    mockUI();
    const created = makePolicy({ policyId: "0xnew", policyName: "Fresh", status: "inactive" });
    const { promptText, promptConfirm } = mockPrompts({
      text: "Fresh",
      confirm: true,
    });
    const createPolicy = vi.fn().mockResolvedValue(created);
    const setPolicyStatus = vi.fn().mockResolvedValue({ ...created, status: "active" });
    mockGasManagerClient({
      listAllPolicies: vi.fn().mockResolvedValue([]),
      createPolicy,
      setPolicyStatus,
    });

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    const program = new Command();
    const result = await selectOrCreatePolicy({
      flavor: "sponsorship",
      network: "eth-mainnet",
      program,
      skipPersistPrompt: true,
    });

    expect(result).toBe("0xnew");
    expect(promptText).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(expect.objectContaining({
      policyName: "Fresh",
      policyType: "sponsorship",
      appId: APP_ID,
      networks: ["ETH_MAINNET"],
    }));
    expect(setPolicyStatus).toHaveBeenCalledWith("0xnew", "active");
    expect(promptConfirm).toHaveBeenCalledTimes(1); // activation prompt only
  });

  it("Solana flavor uses solanaRules and SOLANA_MAINNET", async () => {
    mockConfig();
    mockUI();
    const created = makePolicy({ policyType: "solana", policyId: "0xs", networks: ["SOLANA_MAINNET"] });
    mockPrompts({ text: "Solana Policy", confirm: false });
    const createPolicy = vi.fn().mockResolvedValue(created);
    mockGasManagerClient({
      listAllPolicies: vi.fn().mockResolvedValue([]),
      createPolicy,
    });

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    const result = await selectOrCreatePolicy({
      flavor: "solana",
      network: "solana-mainnet",
      program: new Command(),
      skipPersistPrompt: true,
    });

    expect(result).toBe("0xs");
    expect(createPolicy).toHaveBeenCalledWith(expect.objectContaining({
      policyType: "solana",
      networks: ["SOLANA_MAINNET"],
      solanaRules: expect.objectContaining({ maxCount: "1000" }),
    }));
  });

  it("returns null when the user cancels the autocomplete prompt", async () => {
    mockConfig();
    mockUI();
    mockPrompts({ autocomplete: null });
    mockGasManagerClient({
      listAllPolicies: vi.fn().mockResolvedValue([makePolicy()]),
    });

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    const result = await selectOrCreatePolicy({
      flavor: "sponsorship",
      network: "eth-mainnet",
      program: new Command(),
    });

    expect(result).toBeNull();
  });

  it("filters out policies whose type or network doesn't match the request", async () => {
    mockConfig();
    mockUI();
    const { promptAutocomplete } = mockPrompts({ autocomplete: null });
    mockGasManagerClient({
      listAllPolicies: vi.fn().mockResolvedValue([
        makePolicy({ policyId: "evm-eth", policyType: "sponsorship", networks: ["ETH_MAINNET"] }),
        makePolicy({ policyId: "evm-base", policyType: "sponsorship", networks: ["BASE_MAINNET"] }),
        makePolicy({ policyId: "sol", policyType: "solana", networks: ["ETH_MAINNET"] }),
      ]),
    });

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    await selectOrCreatePolicy({
      flavor: "sponsorship",
      network: "eth-mainnet",
      program: new Command(),
    });

    const offered = promptAutocomplete.mock.calls[0][0].options.map((o: { value: string }) => o.value);
    expect(offered).toEqual(["evm-eth", "__create_new__"]);
  });

  it("throws errAppRequired when no default app is configured", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
      KEY_MAP: {},
    }));
    mockUI();
    mockPrompts({});
    mockGasManagerClient({});

    const { selectOrCreatePolicy } = await import("../../src/lib/policy-prompt.js");
    await expect(
      selectOrCreatePolicy({
        flavor: "sponsorship",
        network: "eth-mainnet",
        program: new Command(),
      }),
    ).rejects.toMatchObject({ code: "APP_REQUIRED" });
  });
});
