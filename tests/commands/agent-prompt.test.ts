import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { ErrorCode } from "../../src/lib/errors.js";

describe("agent-prompt command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("emits JSON payload with all required top-level keys", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    program.command("balance").description("Get ETH balance");
    program.command("app").description("Manage apps");
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    expect(printHuman).toHaveBeenCalledTimes(1);
    const payload = printHuman.mock.calls[0][1];

    expect(payload).toHaveProperty("executionPolicy");
    expect(payload).toHaveProperty("preflight");
    expect(payload).toHaveProperty("runtimeDiscovery");
    expect(payload).toHaveProperty("auth");
    expect(payload).toHaveProperty("commands");
    expect(payload).toHaveProperty("errors");
    expect(payload).toHaveProperty("examples");
    expect(payload).toHaveProperty("docs");
  });

  it("errors map contains all ErrorCode values", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const payload = printHuman.mock.calls[0][1];
    for (const code of Object.values(ErrorCode)) {
      expect(payload.errors).toHaveProperty(code);
      expect(payload.errors[code]).toHaveProperty("exitCode");
      expect(payload.errors[code]).toHaveProperty("retryable");
      expect(payload.errors[code]).toHaveProperty("recovery");
    }
  });

  it("commands array excludes agent-prompt itself", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    program.command("balance").description("Get ETH balance");
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const payload = printHuman.mock.calls[0][1];
    const commandNames = payload.commands.map(
      (c: { name: string }) => c.name,
    );
    expect(commandNames).toContain("balance");
    expect(commandNames).not.toContain("agent-prompt");
  });

  it("marks RATE_LIMITED and NETWORK_ERROR as retryable", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const payload = printHuman.mock.calls[0][1];
    expect(payload.errors.RATE_LIMITED.retryable).toBe(true);
    expect(payload.errors.NETWORK_ERROR.retryable).toBe(true);
    expect(payload.errors.AUTH_REQUIRED.retryable).toBe(false);
    expect(payload.errors.INVALID_ARGS.retryable).toBe(false);
  });

  it("includes update-check guidance for automation", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const payload = printHuman.mock.calls[0][1];
    expect(payload.executionPolicy).toContain(
      "Run alchemy --json --no-interactive update-check when you need to detect available CLI upgrades",
    );
    expect(payload.examples).toContain("alchemy --json --no-interactive update-check");
    expect(payload.examples).toContain("ALCHEMY_ACCESS_KEY=ak_xxx alchemy --json --no-interactive app list");
    expect(payload.examples).not.toContain("ALCHEMY_ACCESS_KEY=$ALCHEMY_ACCESS_KEY alchemy --json --no-interactive app list");
  });

  it("includes runtime discovery guidance for latest published CLI help", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const formatted = printHuman.mock.calls[0][0] as string;
    const payload = printHuman.mock.calls[0][1];

    expect(payload.executionPolicy).toContain(
      "Before answering Alchemy CLI capability or usage questions, inspect the live command contract from agent-prompt and trust it over model memory",
    );
    expect(payload.executionPolicy).toContain(
      "For general capability and usage questions, prefer npx -y @alchemy/cli@latest --json --no-interactive agent-prompt so stale local installs or PATH shims do not hide new commands",
    );
    expect(payload.runtimeDiscovery.latest.command).toBe(
      "npx -y @alchemy/cli@latest --json --no-interactive agent-prompt",
    );
    expect(payload.runtimeDiscovery.commandHelp.commandTemplate).toBe(
      "npx -y @alchemy/cli@latest --no-interactive help <command...>",
    );
    expect(payload.runtimeDiscovery.versionCheck).toMatchObject({
      installedCommand: "alchemy --json --no-interactive version",
      latestCommand: "npx -y @alchemy/cli@latest --json --no-interactive version",
    });
    expect(payload.runtimeDiscovery.pathCheck.command).toBe(
      "command -v alchemy && alchemy version",
    );
    expect(formatted).toContain("Runtime discovery:");
    expect(formatted).toContain("Latest npm CLI: npx -y @alchemy/cli@latest --json --no-interactive agent-prompt");
  });

  it("includes auth entries for all method types", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const payload = printHuman.mock.calls[0][1];
    const methods = payload.auth.map(
      (a: { method: string }) => a.method,
    );
    expect(methods).toContain("API key");
    expect(methods).toContain("Access key");
    expect(methods).toContain("Webhook API key");
    expect(methods).toContain("x402 wallet");
    expect(methods).toContain("Wallet session signer (recommended)");
    expect(methods).toContain("Local wallet + API key");
  });

  it("describes access key auth without a fake command-line flag", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const formatted = printHuman.mock.calls[0][0] as string;
    const payload = printHuman.mock.calls[0][1];
    const accessKeyEntry = payload.auth.find(
      (a: { method: string }) => a.method === "Access key",
    );

    expect(accessKeyEntry).not.toHaveProperty("flag");
    expect(accessKeyEntry.configKey).toBe("access-key");
    expect(accessKeyEntry.notes).toContain("No command-line flag exists");
    expect(formatted).toContain("config:   alchemy config set access-key <value>");
    expect(formatted).not.toContain("flag:     env only");
  });

  it("describes wallet signer setup without suggesting config set active-signer", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman,
    }));

    const { registerAgentPrompt } = await import(
      "../../src/commands/agent-prompt.js"
    );
    const program = new Command();
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    const formatted = printHuman.mock.calls[0][0] as string;
    const payload = printHuman.mock.calls[0][1];
    const walletSessionEntry = payload.auth.find(
      (a: { method: string }) => a.method === "Wallet session signer (recommended)",
    );

    expect(formatted).not.toContain("alchemy config set active-signer <value>");
    expect(walletSessionEntry.setup).toBe("alchemy wallet connect && alchemy wallet use session");
    expect(walletSessionEntry.notes).toContain("does not authenticate by itself");
  });
});
