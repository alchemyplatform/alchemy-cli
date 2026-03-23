import { beforeEach, describe, expect, it, vi } from "vitest";

describe("onboarding flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns false when onboarding is cancelled", async () => {
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue(null),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli to update",
      ]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn().mockReturnValue({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      brand: (s: string) => s,
      bold: (s: string) => s,
      brandedHelp: () => "",
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/commands/config.js", () => ({
      selectOrCreateApp: vi.fn(),
    }));
    vi.doMock("../../src/commands/wallet.js", () => ({
      generateAndPersistWallet: vi.fn(),
      importAndPersistWallet: vi.fn(),
    }));

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(false);
  });

  it("returns true when api key setup completes", async () => {
    const load = vi
      .fn()
      .mockReturnValueOnce({})
      .mockReturnValueOnce({ api_key: "api_test" })
      .mockReturnValue({ api_key: "api_test" });
    const save = vi.fn();
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("api-key"),
      promptText: vi.fn().mockResolvedValue("api_test"),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli to update",
      ]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load,
      save,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      brand: (s: string) => s,
      bold: (s: string) => s,
      brandedHelp: () => "",
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/commands/config.js", () => ({
      selectOrCreateApp: vi.fn(),
    }));
    vi.doMock("../../src/commands/wallet.js", () => ({
      generateAndPersistWallet: vi.fn(),
      importAndPersistWallet: vi.fn(),
    }));

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(true);
    expect(save).toHaveBeenCalledWith({ api_key: "api_test" });
  });

  it("returns false when Exit onboarding is selected", async () => {
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("exit"),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli to update",
      ]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn().mockReturnValue({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      brand: (s: string) => s,
      bold: (s: string) => s,
      brandedHelp: () => "",
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/commands/config.js", () => ({
      selectOrCreateApp: vi.fn(),
    }));
    vi.doMock("../../src/commands/wallet.js", () => ({
      generateAndPersistWallet: vi.fn(),
      importAndPersistWallet: vi.fn(),
    }));

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(false);
  });

  it("prints next steps when selected path remains incomplete", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("api-key"),
      promptText: vi.fn().mockResolvedValue(""),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli to update",
      ]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn().mockReturnValue({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      brand: (s: string) => s,
      bold: (s: string) => s,
      brandedHelp: () => "",
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/commands/config.js", () => ({
      selectOrCreateApp: vi.fn(),
    }));
    vi.doMock("../../src/commands/wallet.js", () => ({
      generateAndPersistWallet: vi.fn(),
      importAndPersistWallet: vi.fn(),
    }));

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("  Next steps:");
    expect(logSpy).toHaveBeenCalledWith("  - alchemy config set api-key <key>");
  });

  it("prints the update notice on the onboarding screen when provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn().mockResolvedValue("exit"),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli to update",
      ]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn().mockReturnValue({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      brand: (s: string) => s,
      bold: (s: string) => s,
      brandedHelp: () => "",
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: vi.fn(),
    }));
    vi.doMock("../../src/commands/config.js", () => ({
      selectOrCreateApp: vi.fn(),
    }));
    vi.doMock("../../src/commands/wallet.js", () => ({
      generateAndPersistWallet: vi.fn(),
      importAndPersistWallet: vi.fn(),
    }));

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never, "9.9.9");
    expect(completed).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("  Update available 0.2.0 -> 9.9.9");
    expect(logSpy).toHaveBeenCalledWith("  Run npm i -g @alchemy/cli to update");
  });
});
