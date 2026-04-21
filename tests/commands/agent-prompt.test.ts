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
    program.command("apps").description("Manage apps");
    registerAgentPrompt(program);

    await program.parseAsync(["node", "test", "agent-prompt"], {
      from: "node",
    });

    expect(printHuman).toHaveBeenCalledTimes(1);
    const payload = printHuman.mock.calls[0][1];

    expect(payload).toHaveProperty("executionPolicy");
    expect(payload).toHaveProperty("preflight");
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
  });
});
