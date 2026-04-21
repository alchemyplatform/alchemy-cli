import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("completions command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("generates bash completions", async () => {
    const { registerCompletions } = await import("../../src/commands/completions.js");
    const program = new Command();
    program.command("balance").description("Get balance");
    program.command("tx").description("Get transaction");
    program
      .command("config")
      .description("Manage config")
      .command("set")
      .description("Set a value");
    registerCompletions(program);

    let output = "";
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["node", "test", "completions", "bash"], { from: "node" });
    } finally {
      process.stdout.write = origWrite;
    }

    expect(output).toContain("_alchemy_completions");
    expect(output).toContain("complete -F _alchemy_completions alchemy");
    expect(output).toContain("balance");
    expect(output).toContain("config");
  });

  it("generates zsh completions", async () => {
    const { registerCompletions } = await import("../../src/commands/completions.js");
    const program = new Command();
    program.command("balance").description("Get balance");
    registerCompletions(program);

    let output = "";
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["node", "test", "completions", "zsh"], { from: "node" });
    } finally {
      process.stdout.write = origWrite;
    }

    expect(output).toContain("#compdef alchemy");
    expect(output).toContain("_alchemy");
    expect(output).toContain("balance");
  });

  it("generates fish completions", async () => {
    const { registerCompletions } = await import("../../src/commands/completions.js");
    const program = new Command();
    program.command("balance").description("Get balance");
    registerCompletions(program);

    let output = "";
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      output += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      await program.parseAsync(["node", "test", "completions", "fish"], { from: "node" });
    } finally {
      process.stdout.write = origWrite;
    }

    expect(output).toContain("complete -c alchemy");
    expect(output).toContain("balance");
  });

  it("exits with error for unknown shell", async () => {
    const { registerCompletions } = await import("../../src/commands/completions.js");
    const program = new Command();
    registerCompletions(program);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockStderr = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await program.parseAsync(["node", "test", "completions", "powershell"], { from: "node" });
    } catch {
      // expected
    }

    expect(mockStderr).toHaveBeenCalledWith(
      expect.stringContaining("Unknown shell: powershell"),
    );
    expect(mockExit).toHaveBeenCalledWith(2);

    mockExit.mockRestore();
    mockStderr.mockRestore();
  });
});
