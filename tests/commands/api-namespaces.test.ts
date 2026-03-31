import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

describe("new API namespace commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("trace prefixes method names", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("../../src/lib/resolve.js", () => ({ clientFromFlags: () => ({ call }) }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_a: string, _b: string, fn: () => Promise<unknown>) => fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerTrace } = await import("../../src/commands/trace.js");
    const program = new Command();
    registerTrace(program);
    await program.parseAsync(["node", "test", "trace", "call", '{"to":"0x1"}', '["trace"]'], { from: "node" });
    expect(call).toHaveBeenCalledWith("trace_call", [{ to: "0x1" }, ["trace"]]);
  });

  it("debug prefixes method names", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("../../src/lib/resolve.js", () => ({ clientFromFlags: () => ({ call }) }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_a: string, _b: string, fn: () => Promise<unknown>) => fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerDebug } = await import("../../src/commands/debug.js");
    const program = new Command();
    registerDebug(program);
    await program.parseAsync(["node", "test", "debug", "traceTransaction", '"0xabc"'], { from: "node" });
    expect(call).toHaveBeenCalledWith("debug_traceTransaction", ["0xabc"]);
  });

  it("prices symbol calls prices REST API", async () => {
    const callApiPrices = vi.fn().mockResolvedValue({ data: [] });
    vi.doMock("../../src/lib/rest.js", () => ({ callApiPrices }));
    vi.doMock("../../src/lib/resolve.js", () => ({ resolveAPIKey: () => "k", resolveX402Client: () => null }));
    vi.doMock("../../src/lib/validators.js", () => ({ splitCommaList: (s: string) => s.split(",") }));
    vi.doMock("../../src/lib/output.js", () => ({ isJSONMode: () => true, printJSON: vi.fn() }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_a: string, _b: string, fn: () => Promise<unknown>) => fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerPrices } = await import("../../src/commands/prices.js");
    const program = new Command();
    registerPrices(program);
    await program.parseAsync(["node", "test", "prices", "symbol", "ETH,USDC"], { from: "node" });
    expect(callApiPrices).toHaveBeenCalled();
  });

  it("simulate execution calls execution method", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("../../src/lib/resolve.js", () => ({ clientFromFlags: () => ({ call }) }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_a: string, _b: string, fn: () => Promise<unknown>) => fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerSimulate } = await import("../../src/commands/simulate.js");
    const program = new Command();
    registerSimulate(program);
    await program.parseAsync(
      ["node", "test", "simulate", "execution", "--tx", '{"to":"0x1"}'],
      { from: "node" },
    );
    expect(call).toHaveBeenCalledWith("alchemy_simulateExecution", [{ to: "0x1" }, "latest"]);
  });

  it("solana rpc forwards method", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("../../src/lib/resolve.js", () => ({ clientFromFlags: () => ({ call }) }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_a: string, _b: string, fn: () => Promise<unknown>) => fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError: vi.fn() }));

    const { registerSolana } = await import("../../src/commands/solana.js");
    const program = new Command();
    registerSolana(program);
    await program.parseAsync(["node", "test", "solana", "rpc", "getBalance", '"addr"'], { from: "node" });
    expect(call).toHaveBeenCalledWith("getBalance", ["addr"]);
  });
});
