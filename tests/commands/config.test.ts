import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

const KEY_MAP = {
  "api-key": "api_key",
  api_key: "api_key",
  "access-key": "access_key",
  access_key: "access_key",
  "webhook-api-key": "webhook_api_key",
  webhook_api_key: "webhook_api_key",
  app: "app",
  network: "network",
  verbose: "verbose",
  "wallet-key-file": "wallet_key_file",
  wallet_key_file: "wallet_key_file",
  "wallet-address": "wallet_address",
  wallet_address: "wallet_address",
  x402: "x402",
} as const;

function mockConfigModule(deps: {
  load?: ReturnType<typeof vi.fn>;
  save?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  toMap?: ReturnType<typeof vi.fn>;
}) {
  const load = deps.load ?? vi.fn().mockReturnValue({});
  const save = deps.save ?? vi.fn();
  const get = deps.get ?? vi.fn();
  const toMap = deps.toMap ?? vi.fn((cfg) => cfg);

  vi.doMock("../../src/lib/config.js", () => ({
    load,
    save,
    get,
    toMap,
    KEY_MAP,
  }));

  return { load, save, get, toMap };
}

function mockConfigDependencies(opts?: { interactive?: boolean; confirmResult?: boolean | null }) {
  const adminCtor = vi.fn();
  const promptConfirm = vi.fn().mockResolvedValue(opts?.confirmResult ?? false);

  vi.doMock("../../src/lib/admin-client.js", () => ({ AdminClient: adminCtor }));
  vi.doMock("../../src/lib/interaction.js", () => ({
    isInteractiveAllowed: () => opts?.interactive ?? false,
  }));
  vi.doMock("../../src/lib/terminal-ui.js", () => ({
    promptAutocomplete: vi.fn(),
    promptConfirm,
    promptMultiselect: vi.fn(),
    promptSelect: vi.fn(),
    promptText: vi.fn(),
  }));

  return { adminCtor, promptConfirm };
}

describe("config command", () => {
  it("normalizes verbose boolean on set", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const save = vi.fn();
    mockConfigModule({
      load: vi.fn().mockReturnValue({ api_key: "k" }),
      save,
    });
    mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "set", "verbose", "TRUE"]);

    expect(save).toHaveBeenCalledWith({ api_key: "k", verbose: true });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes invalid verbose values to exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    mockConfigModule({ load: vi.fn().mockReturnValue({}), save: vi.fn() });
    mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "set", "verbose", "maybe"]);

    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0][0]).toMatchObject({ code: "INVALID_ARGS" });
  });

  it("sets access-key without app-selection flow in non-interactive mode", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const save = vi.fn();
    const load = vi.fn().mockReturnValue({});
    mockConfigModule({ load, save });
    const { adminCtor } = mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "set", "access-key", "ak_test"]);

    expect(save).toHaveBeenCalledWith({ access_key: "ak_test" });
    expect(adminCtor).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("lists config map in JSON mode", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const map = { "api-key": "masked", network: "eth-mainnet" };
    mockConfigModule({
      load: vi.fn().mockReturnValue({ api_key: "key", network: "eth-mainnet" }),
      toMap: vi.fn().mockReturnValue(map),
    });
    mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "list"]);

    expect(printJSON).toHaveBeenCalledWith(map);
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("resets one key without wiping other config values", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const save = vi.fn();
    mockConfigModule({
      load: vi.fn().mockReturnValue({ api_key: "k", network: "eth-mainnet" }),
      save,
    });
    mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "reset", "network"]);

    expect(save).toHaveBeenCalledWith({ api_key: "k" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("resets all keys when --yes is provided", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const save = vi.fn();
    mockConfigModule({
      load: vi.fn().mockReturnValue({ api_key: "k", access_key: "ak" }),
      save,
    });
    const { promptConfirm } = mockConfigDependencies({ interactive: true });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "reset", "--yes"]);

    expect(save).toHaveBeenCalledWith({});
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND contract when config key is missing", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    mockConfigModule({
      load: vi.fn().mockReturnValue({}),
      get: vi.fn().mockReturnValue(undefined),
    });
    mockConfigDependencies({ interactive: false });

    const { registerConfig } = await import("../../src/commands/config.js");
    await runRegisteredCommand(registerConfig, ["config", "get", "api-key"]);

    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(exitWithError.mock.calls[0][0]).toMatchObject({ code: "NOT_FOUND" });
  });
});
