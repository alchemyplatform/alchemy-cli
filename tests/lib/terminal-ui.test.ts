import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface TerminalUiMocks {
  stdin: EventEmitter & {
    isTTY: boolean;
    isRaw: boolean;
    resume: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    ref: ReturnType<typeof vi.fn>;
    setRawMode: ReturnType<typeof vi.fn>;
  };
  stdout: {
    isTTY: boolean;
    write: ReturnType<typeof vi.fn>;
  };
  rl: {
    on: ReturnType<typeof vi.fn>;
    question: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  answer: (value: string) => void;
  interruptTextPrompt: () => void;
}

function installTerminalUiMocks(): TerminalUiMocks {
  let questionCallback: ((value: string) => void) | undefined;
  let sigintHandler: (() => void) | undefined;

  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    isRaw: false,
    resume: vi.fn(),
    pause: vi.fn(),
    ref: vi.fn(),
    setRawMode: vi.fn((enabled: boolean) => {
      stdin.isRaw = enabled;
    }),
  });
  const stdout = {
    isTTY: true,
    write: vi.fn(),
  };
  const rl = {
    on: vi.fn((event: string, handler: () => void) => {
      if (event === "SIGINT") {
        sigintHandler = handler;
      }
      return rl;
    }),
    question: vi.fn((_question: string, callback: (value: string) => void) => {
      questionCallback = callback;
    }),
    close: vi.fn(),
  };

  vi.doMock("node:process", () => ({
    stdin,
    stdout,
  }));
  vi.doMock("node:readline", () => ({
    createInterface: vi.fn(() => rl),
    emitKeypressEvents: vi.fn(),
    clearLine: vi.fn(),
    cursorTo: vi.fn(),
    moveCursor: vi.fn(),
  }));

  return {
    stdin,
    stdout,
    rl,
    answer(value: string) {
      if (!questionCallback) throw new Error("question callback was not registered");
      questionCallback(value);
    },
    interruptTextPrompt() {
      if (!sigintHandler) throw new Error("SIGINT handler was not registered");
      sigintHandler();
    },
  };
}

describe("terminal-ui prompts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("node:process");
    vi.doUnmock("node:readline");
  });

  it("pauses stdin after text prompts so one-shot commands can exit", async () => {
    const mocks = installTerminalUiMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { promptText } = await import("../../src/lib/terminal-ui.js");

    const prompt = promptText({ message: "Continue" });
    mocks.answer("");
    await expect(prompt).resolves.toBe("");

    expect(mocks.stdin.resume).toHaveBeenCalledTimes(1);
    expect(mocks.stdin.ref).toHaveBeenCalledTimes(1);
    expect(mocks.rl.close).toHaveBeenCalledTimes(1);
    expect(mocks.stdin.pause).toHaveBeenCalledTimes(1);
  });

  it("treats Ctrl-C in text prompts as a process interrupt", async () => {
    const mocks = installTerminalUiMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const onSigint = vi.fn();
    process.once("SIGINT", onSigint);

    const { promptText } = await import("../../src/lib/terminal-ui.js");
    const prompt = promptText({ message: "Continue" });
    mocks.interruptTextPrompt();
    await expect(prompt).resolves.toBeNull();

    expect(mocks.rl.close).toHaveBeenCalledTimes(1);
    expect(mocks.stdin.pause).toHaveBeenCalledTimes(1);
    expect(onSigint).toHaveBeenCalledTimes(1);
  });

  it("treats Ctrl-C in list prompts as a process interrupt", async () => {
    const mocks = installTerminalUiMocks();
    const onSigint = vi.fn();
    process.once("SIGINT", onSigint);

    const { promptSelect } = await import("../../src/lib/terminal-ui.js");
    const prompt = promptSelect({
      message: "Select app",
      options: [{ value: "app_123", label: "Test App" }],
    });
    mocks.stdin.emit("keypress", "\u0003", { name: "c", ctrl: true });
    await expect(prompt).resolves.toBeNull();

    expect(mocks.stdin.setRawMode).toHaveBeenCalledWith(true);
    expect(mocks.stdin.setRawMode).toHaveBeenCalledWith(false);
    expect(mocks.stdin.pause).toHaveBeenCalledTimes(1);
    expect(onSigint).toHaveBeenCalledTimes(1);
  });

  it("keeps autocomplete typing active after a text prompt", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const stdin = new PassThrough() as PassThrough & {
      isTTY: boolean;
      isRaw: boolean;
      ref: ReturnType<typeof vi.fn>;
      setRawMode: ReturnType<typeof vi.fn>;
    };
    const stdout = Object.assign(new PassThrough(), {
      isTTY: true,
      columns: 80,
    });
    const resume = stdin.resume.bind(stdin);
    const pause = stdin.pause.bind(stdin);
    stdin.isTTY = true;
    stdin.isRaw = false;
    stdin.resume = vi.fn(() => resume());
    stdin.pause = vi.fn(() => pause());
    stdin.ref = vi.fn();
    stdin.setRawMode = vi.fn((enabled: boolean) => {
      stdin.isRaw = enabled;
    });

    vi.doMock("node:process", () => ({
      stdin,
      stdout,
    }));

    const { promptAutocomplete, promptText } = await import("../../src/lib/terminal-ui.js");

    const textPrompt = promptText({ message: "Continue" });
    stdin.write("\n");
    await expect(textPrompt).resolves.toBe("");

    const appPrompt = promptAutocomplete({
      message: "Select an app",
      placeholder: "Type to search by name",
      options: [
        { value: "app_alpha", label: "Alpha" },
        { value: "app_beta", label: "Beta" },
      ],
    });
    stdin.write("b");
    stdin.write("\r");

    await expect(appPrompt).resolves.toBe("app_beta");
  });
});
