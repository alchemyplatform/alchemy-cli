import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("config status command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("config status prints JSON contract", async () => {
    const printJSON = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "api_test" }),
      KEY_MAP: {},
      get: vi.fn(),
      save: vi.fn(),
      toMap: vi.fn(),
      configDir: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      dim: (s: string) => s,
      green: (s: string) => s,
      yellow: (s: string) => s,
      withSpinner: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptAutocomplete: vi.fn(),
      promptConfirm: vi.fn(),
      promptMultiselect: vi.fn(),
      promptSelect: vi.fn(),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      splitCommaList: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/resolve.js", async () => ({
      ...(await vi.importActual("../../src/lib/resolve.js")),
      resolveAuthToken: () => undefined,
      resolveWalletSession: () => null,
      adminClientFromFlags: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", () => ({
      errNotFound: vi.fn(),
      errAccessKeyRequired: vi.fn(),
      errInvalidArgs: vi.fn(),
      exitWithError: vi.fn(),
    }));

    const { registerConfig } = await import("../../src/commands/config.js");
    const program = new Command();
    registerConfig(program);

    await program.parseAsync(["node", "test", "config", "status"], { from: "node" });
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      complete: true,
      satisfiedBy: "api_key",
      missing: [],
      nextCommands: [],
      capabilities: expect.objectContaining({
        rpc_data: expect.objectContaining({
          complete: true,
          satisfiedBy: "api_key",
        }),
      }),
    }));
  });
});
