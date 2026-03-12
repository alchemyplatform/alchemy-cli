import { Command } from "commander";
import { beforeEach, vi } from "vitest";

export function useCommandTestReset(): void {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });
}

export function installBaseCommandMocks(opts?: { jsonMode?: boolean }) {
  const jsonMode = opts?.jsonMode ?? true;

  const printJSON = vi.fn();
  const printHuman = vi.fn();
  const printSyntaxJSON = vi.fn();
  const printTable = vi.fn();
  const printKeyValueBox = vi.fn();
  const emptyState = vi.fn();
  const exitWithError = vi.fn();

  vi.doMock("../../src/lib/output.js", () => ({
    isJSONMode: () => jsonMode,
    printJSON,
    printHuman,
    verbose: false,
  }));

  vi.doMock("../../src/lib/ui.js", () => ({
    green: (s: string) => s,
    dim: (s: string) => s,
    yellow: (s: string) => s,
    maskIf: (s: string) => s,
    withSpinner: async (
      _start: string,
      _end: string,
      fn: () => Promise<unknown>,
    ) => fn(),
    printSyntaxJSON,
    printTable,
    printKeyValueBox,
    emptyState,
  }));

  vi.doMock("../../src/lib/errors.js", async () => ({
    ...(await vi.importActual("../../src/lib/errors.js")),
    exitWithError,
  }));

  return {
    printJSON,
    printHuman,
    printSyntaxJSON,
    printTable,
    printKeyValueBox,
    emptyState,
    exitWithError,
  };
}

export async function runRegisteredCommand(
  register: (program: Command) => void,
  args: string[],
): Promise<void> {
  const program = new Command();
  register(program);
  await program.parseAsync(["node", "test", ...args], { from: "node" });
}

export function setTTY(stdin: boolean, stdout: boolean): () => void {
  const prevIn = process.stdin.isTTY;
  const prevOut = process.stdout.isTTY;
  Object.defineProperty(process.stdin, "isTTY", {
    value: stdin,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value: stdout,
    configurable: true,
  });

  return () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: prevIn,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "isTTY", {
      value: prevOut,
      configurable: true,
    });
  };
}
