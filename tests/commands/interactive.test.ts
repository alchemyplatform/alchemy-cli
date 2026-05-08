import { EventEmitter } from "node:events";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("interactive mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("closes the REPL on Ctrl-C", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stdin = Object.assign(new EventEmitter(), {
      isTTY: true,
      resume: vi.fn(),
      ref: vi.fn(),
      setRawMode: vi.fn(),
    });
    const stdout = {
      isTTY: true,
      write: vi.fn(),
    };
    const stderr = {
      write: vi.fn(),
    };

    const rl = Object.assign(new EventEmitter(), {
      line: "",
      cursor: 0,
      prompt: vi.fn(),
      close: vi.fn(() => {
        rl.emit("close");
      }),
      write: vi.fn(),
    });

    vi.doMock("node:process", () => ({
      stdin,
      stdout,
      stderr,
    }));
    vi.doMock("node:readline", () => ({
      createInterface: vi.fn(() => rl),
      clearLine: vi.fn(),
      moveCursor: vi.fn(),
      cursorTo: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (value: string) => value,
      brandedHelp: () => "",
      brand: (value: string) => value,
      dim: (value: string) => value,
      green: (value: string) => value,
      setBrandedHelpSuppressed: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", () => ({
      setReplMode: vi.fn(),
    }));
    vi.doMock("../../src/lib/networks.js", () => ({
      getRPCNetworkIds: () => [],
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      configDir: () => "/tmp/alchemy-cli-test",
      load: () => ({}),
    }));
    vi.doMock("../../src/lib/onboarding.js", () => ({
      getSetupMethod: () => null,
    }));
    vi.doMock("../../src/lib/colors.js", () => ({
      bgRgb: () => (value: string) => value,
      rgb: () => (value: string) => value,
      noColor: true,
    }));
    vi.doMock("../../src/lib/update-check.js", () => ({
      getUpdateNoticeLines: () => [],
    }));

    const { startREPL } = await import("../../src/commands/interactive.js");
    const repl = startREPL(new Command());
    rl.emit("SIGINT");

    await expect(repl).resolves.toBeUndefined();
    expect(rl.close).toHaveBeenCalledTimes(1);
  });
});
