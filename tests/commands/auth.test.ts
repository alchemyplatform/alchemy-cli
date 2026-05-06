import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

describe("auth command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("auth login --force returns without exiting in interactive mode", async () => {
    let cfg: Record<string, unknown> = { auth_token: "old-token" };
    const save = vi.fn((next: Record<string, unknown>) => {
      cfg = next;
    });
    const printHuman = vi.fn();
    const processExit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn(() => cfg),
      save,
      configPath: vi.fn().mockReturnValue("/tmp/alchemy/config.json"),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      AUTH_PORT: 16424,
      prepareLogin: vi.fn().mockReturnValue({
        loginUrl: "https://auth.alchemy.com/login",
        callbackPromise: new Promise(() => {}),
        codeVerifier: "test-verifier",
        port: 16424,
        cancel: vi.fn(),
      }),
      completeLogin: vi.fn().mockResolvedValue({
        token: "new-token",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
      revokeToken: vi.fn().mockResolvedValue("revoked"),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: class {
        async listAllApps() {
          return {
            apps: [
              {
                id: "app_123",
                name: "Test App",
                apiKey: "test-api-key",
                webhookApiKey: "test-webhook-key",
                chainNetworks: [{ id: "eth-mainnet" }],
              },
            ],
          };
        }
      },
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      debug: vi.fn(),
      isJSONMode: vi.fn().mockReturnValue(false),
      printHuman,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptAutocomplete: vi.fn(),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveAuthToken: vi.fn().mockReturnValue(undefined),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      brand: (s: string) => s,
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      withSpinner: vi.fn(async (_label: string, _success: string, fn: () => Promise<unknown>) => fn()),
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { registerAuth } = await import("../../src/commands/auth.js");
    const program = new Command();
    registerAuth(program);

    await expect(
      program.parseAsync(["node", "test", "auth", "login", "--force", "--yes"], {
        from: "node",
      }),
    ).resolves.toBe(program);

    expect(processExit).not.toHaveBeenCalled();
    expect(printHuman).toHaveBeenCalledWith(
      expect.stringContaining("Logged in successfully"),
      expect.objectContaining({
        status: "authenticated",
        expiresAt: "2099-01-01T00:00:00Z",
        configPath: "/tmp/alchemy/config.json",
      }),
    );
    expect(save).toHaveBeenNthCalledWith(1, {
      auth_token: undefined,
      auth_token_expires_at: undefined,
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      auth_token: "new-token",
      auth_token_expires_at: "2099-01-01T00:00:00Z",
    });
    expect(save).toHaveBeenNthCalledWith(3, {
      auth_token: "new-token",
      auth_token_expires_at: "2099-01-01T00:00:00Z",
      app: {
        id: "app_123",
        name: "Test App",
        apiKey: "test-api-key",
        webhookApiKey: "test-webhook-key",
      },
    });
    expect(logSpy).toHaveBeenCalledWith("  ✓ Auto-selected app: Test App");
  });

  it("auth login skips app fetch when an app is already configured", async () => {
    let cfg: Record<string, unknown> = {
      auth_token: "old-token",
      app: {
        id: "app_existing",
        name: "Existing App",
        apiKey: "existing-api-key",
        webhookApiKey: "existing-webhook-key",
      },
    };
    const save = vi.fn((next: Record<string, unknown>) => {
      cfg = next;
    });
    const listAllApps = vi.fn();
    const printHuman = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn(() => cfg),
      save,
      configPath: vi.fn().mockReturnValue("/tmp/alchemy/config.json"),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      AUTH_PORT: 16424,
      prepareLogin: vi.fn().mockReturnValue({
        loginUrl: "https://auth.alchemy.com/login",
        callbackPromise: new Promise(() => {}),
        codeVerifier: "test-verifier",
        port: 16424,
      }),
      completeLogin: vi.fn().mockResolvedValue({
        token: "new-token",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
      revokeToken: vi.fn().mockResolvedValue("revoked"),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: class {
        listAllApps = listAllApps;
      },
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      debug: vi.fn(),
      isJSONMode: vi.fn().mockReturnValue(false),
      printHuman,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptAutocomplete: vi.fn(),
      promptText: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveAuthToken: vi.fn().mockReturnValue(undefined),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      brand: (s: string) => s,
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      withSpinner: vi.fn(async (_label: string, _success: string, fn: () => Promise<unknown>) => fn()),
    }));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { registerAuth } = await import("../../src/commands/auth.js");
    const program = new Command();
    registerAuth(program);

    await expect(
      program.parseAsync(["node", "test", "auth", "login", "--force", "--yes"], {
        from: "node",
      }),
    ).resolves.toBe(program);

    expect(printHuman).toHaveBeenCalledWith(
      expect.stringContaining("Logged in successfully"),
      expect.objectContaining({
        status: "authenticated",
      }),
    );
    expect(save).toHaveBeenNthCalledWith(1, {
      auth_token: undefined,
      auth_token_expires_at: undefined,
      app: {
        id: "app_existing",
        name: "Existing App",
        apiKey: "existing-api-key",
        webhookApiKey: "existing-webhook-key",
      },
    });
    expect(save).toHaveBeenNthCalledWith(2, {
      auth_token: "new-token",
      auth_token_expires_at: "2099-01-01T00:00:00Z",
      app: {
        id: "app_existing",
        name: "Existing App",
        apiKey: "existing-api-key",
        webhookApiKey: "existing-webhook-key",
      },
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(listAllApps).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Auto-selected app"),
    );
  });

  it("auth login skips browser open when callback resolves before prompt", async () => {
    let cfg: Record<string, unknown> = {};
    const save = vi.fn((next: Record<string, unknown>) => {
      cfg = next;
    });
    const printHuman = vi.fn();
    const completeLogin = vi.fn().mockResolvedValue({
      token: "early-token",
      expiresAt: "2099-06-01T00:00:00Z",
    });

    // callbackPromise resolves immediately to simulate early auth
    const callbackPromise = Promise.resolve({ code: "early-code" });

    vi.doMock("../../src/lib/config.js", () => ({
      load: vi.fn(() => cfg),
      save,
      configPath: vi.fn().mockReturnValue("/tmp/alchemy/config.json"),
    }));
    vi.doMock("../../src/lib/auth.js", () => ({
      AUTH_PORT: 16424,
      prepareLogin: vi.fn().mockReturnValue({
        loginUrl: "https://auth.alchemy.com/login",
        callbackPromise,
        codeVerifier: "test-verifier",
        port: 16424,
        cancel: vi.fn(),
      }),
      completeLogin,
      revokeToken: vi.fn().mockResolvedValue("revoked"),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: class {
        async listAllApps() {
          return { apps: [] };
        }
      },
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      debug: vi.fn(),
      isJSONMode: vi.fn().mockReturnValue(false),
      printHuman,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptAutocomplete: vi.fn(),
      promptText: vi.fn().mockResolvedValue(""),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: vi.fn().mockReturnValue(true),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveAuthToken: vi.fn().mockReturnValue(undefined),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      brand: (s: string) => s,
      dim: (s: string) => s,
      green: (s: string) => s,
      maskIf: (s: string) => s,
      withSpinner: vi.fn(async (_label: string, _success: string, fn: () => Promise<unknown>) => fn()),
    }));

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called");
    }) as never);

    const { registerAuth } = await import("../../src/commands/auth.js");
    const program = new Command();
    registerAuth(program);

    // Allow the microtask from callbackPromise.then() to run
    await callbackPromise;
    await new Promise((r) => setTimeout(r, 0));

    await expect(
      program.parseAsync(["node", "test", "auth", "login"], {
        from: "node",
      }),
    ).resolves.toBe(program);

    expect(completeLogin).toHaveBeenCalledWith(
      expect.objectContaining({ loginUrl: "https://auth.alchemy.com/login" }),
      expect.objectContaining({ skipBrowserOpen: true }),
    );
    expect(printHuman).toHaveBeenCalledWith(
      expect.stringContaining("Logged in successfully"),
      expect.objectContaining({ status: "authenticated" }),
    );
  });
});
