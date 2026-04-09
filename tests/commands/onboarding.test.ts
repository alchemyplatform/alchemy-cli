import { beforeEach, describe, expect, it, vi } from "vitest";

describe("onboarding flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns false when browser login fails", async () => {
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptText: vi.fn().mockResolvedValue(""),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      performBrowserLogin: vi.fn().mockRejectedValue(new Error("login failed")),
      AUTH_PORT: 16424,
      prepareBrowserLogin: vi.fn().mockReturnValue({ authorizeUrl: "https://auth.alchemy.com/oauth/authorize", codeVerifier: "test", state: "test" }),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([]),
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

    vi.spyOn(console, "log").mockImplementation(() => {});
    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(false);
  });

  it("returns true when browser login succeeds", async () => {
    const saveCredentials = vi.fn();
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptText: vi.fn().mockResolvedValue(""),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      performBrowserLogin: vi.fn().mockResolvedValue({
        token: "test_token",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
      AUTH_PORT: 16424,
      prepareBrowserLogin: vi.fn().mockReturnValue({ authorizeUrl: "https://auth.alchemy.com/oauth/authorize", codeVerifier: "test", state: "test" }),
    }));
    vi.doMock("../../src/commands/auth.js", () => ({
      selectAppAfterAuth: vi.fn(),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([]),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn().mockReturnValue({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/credential-storage.js", () => ({
      saveCredentials,
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

    vi.spyOn(console, "log").mockImplementation(() => {});
    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(true);
    expect(saveCredentials).toHaveBeenCalledWith({
      auth_token: "test_token",
      auth_token_expires_at: "2099-01-01T00:00:00Z",
    });
  });

  it("returns false when user cancels the prompt", async () => {
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptText: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([]),
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

    vi.spyOn(console, "log").mockImplementation(() => {});
    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    const completed = await runOnboarding({} as never);
    expect(completed).toBe(false);
  });

  it("prints the update notice on the onboarding screen when provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptText: vi.fn().mockResolvedValue(""),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      performBrowserLogin: vi.fn().mockRejectedValue(new Error("login failed")),
      AUTH_PORT: 16424,
      prepareBrowserLogin: vi.fn().mockReturnValue({ authorizeUrl: "https://auth.alchemy.com/oauth/authorize", codeVerifier: "test", state: "test" }),
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: vi.fn().mockReturnValue([
        "  Update available 0.2.0 -> 9.9.9",
        "  Run npm i -g @alchemy/cli@latest to update",
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

    const { runOnboarding } = await import("../../src/commands/onboarding.js");
    await runOnboarding({} as never, "9.9.9");
    expect(logSpy).toHaveBeenCalledWith("  Update available 0.2.0 -> 9.9.9");
    expect(logSpy).toHaveBeenCalledWith("  Run npm i -g @alchemy/cli@latest to update");
  });
});
