import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("rpc command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rpc parses JSON params and forwards mixed values", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    const printSyntaxJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      debug: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printSyntaxJSON,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerRPC } = await import("../../src/commands/rpc.js");
    const program = new Command();
    registerRPC(program);

    await program.parseAsync(
      ["node", "test", "rpc", "eth_call", '{"a":1}', "true", "latest", "7"],
      { from: "node" },
    );

    expect(call).toHaveBeenCalledWith("eth_call", [{ a: 1 }, true, "latest", 7]);
    expect(printSyntaxJSON).toHaveBeenCalledWith({ ok: true });
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
