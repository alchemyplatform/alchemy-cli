import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import { esc, rgb } from "./colors.js";

export type PromptOption<T extends string> = {
  value: T;
  label?: string;
  hint?: string;
  disabled?: boolean;
};

const ansi = {
  cyan: esc("36"),
  dim: esc("2"),
  green: esc("32"),
  red: esc("31"),
  purple: rgb(180, 160, 255),
};

const FLOW_PIPE = "│";

function optionLabel<T extends string>(option: PromptOption<T>): string {
  return option.label ?? String(option.value);
}

function printCancel(message?: string): void {
  if (!message) return;
  console.log(`  ${ansi.dim(FLOW_PIPE)}`);
  console.log(`  ${ansi.dim(message)}`);
}

function clearRenderedLines(lines: number): void {
  for (let i = 0; i < lines; i += 1) {
    readline.clearLine(stdout, 0);
    readline.cursorTo(stdout, 0);
    if (i < lines - 1) {
      readline.moveCursor(stdout, 0, -1);
    }
  }
}

function suspendStdinKeypressListeners(): () => void {
  const listeners = stdin.listeners("keypress");
  for (const listener of listeners) {
    stdin.removeListener("keypress", listener as (...args: unknown[]) => void);
  }
  return () => {
    for (const listener of listeners) {
      stdin.on("keypress", listener as (...args: unknown[]) => void);
    }
  };
}

type RenderResult = {
  value: string | string[] | null;
  cancelled: boolean;
};

async function runListPrompt<T extends string>(opts: {
  message: string;
  options: PromptOption<T>[];
  initialValue?: T;
  placeholder?: string;
  allowMultiple?: boolean;
  required?: boolean;
  filterable?: boolean;
  commitLabel?: string | null;
}): Promise<RenderResult> {
  if (!stdin.isTTY || !stdout.isTTY) {
    const initial = opts.initialValue ?? opts.options.find((o) => !o.disabled)?.value ?? null;
    return { value: initial, cancelled: false };
  }

  readline.emitKeypressEvents(stdin);
  const restoreKeypressListeners = suspendStdinKeypressListeners();
  const previousRawMode = stdin.isRaw;
  stdin.resume();
  stdin.setRawMode(true);

  let query = "";
  let cursor = Math.max(
    0,
    opts.options.findIndex((o) => o.value === opts.initialValue && !o.disabled),
  );
  const selected = new Set<T>();
  const maxVisible = 8;
  let renderedLines = 0;

  const getFiltered = (): PromptOption<T>[] => {
    if (!opts.filterable || !query.trim()) return opts.options;
    const q = query.toLowerCase();
    return opts.options.filter((option) => {
      const label = optionLabel(option).toLowerCase();
      const hint = (option.hint ?? "").toLowerCase();
      const value = String(option.value).toLowerCase();
      return label.includes(q) || hint.includes(q) || value.includes(q);
    });
  };

  const normalizeCursor = (filtered: PromptOption<T>[]): void => {
    if (filtered.length === 0) {
      cursor = 0;
      return;
    }
    if (cursor >= filtered.length) cursor = filtered.length - 1;
    if (cursor < 0) cursor = 0;
    if (filtered[cursor]?.disabled) {
      const next = filtered.findIndex((o) => !o.disabled);
      cursor = next >= 0 ? next : 0;
    }
  };

  const render = (): void => {
    const filtered = getFiltered();
    normalizeCursor(filtered);
    if (renderedLines > 0) clearRenderedLines(renderedLines);

    const lines: string[] = [];
    const suffix = opts.filterable && query ? ` ${ansi.dim(`(${query})`)}` : "";
    lines.push(`  ${ansi.dim(FLOW_PIPE)}`);
    lines.push(`  ${ansi.cyan("◆")} ${opts.message}${suffix}`);

    if (filtered.length === 0) {
      lines.push(`  ${ansi.dim(FLOW_PIPE)} ${ansi.dim("No matches found")}`);
    } else {
      const start = Math.max(0, Math.min(cursor - 3, Math.max(0, filtered.length - maxVisible)));
      const visible = filtered.slice(start, start + maxVisible);
      for (let i = 0; i < visible.length; i += 1) {
        const option = visible[i];
        const active = start + i === cursor;
        const disabled = option.disabled === true;
        const selectedMark = opts.allowMultiple
          ? selected.has(option.value)
            ? ansi.green("◆")
            : ansi.dim("◇")
          : active
            ? ansi.cyan("◆")
            : ansi.dim("◇");
        const label = optionLabel(option);
        const value = disabled ? ansi.dim(label) : label;
        const hint = option.hint ? ` ${ansi.dim(`— ${option.hint}`)}` : "";
        lines.push(`  ${ansi.dim(FLOW_PIPE)}  ${selectedMark} ${value}${hint}`);
      }
      if (filtered.length > maxVisible) {
        lines.push(`  ${ansi.dim(FLOW_PIPE)} ${ansi.dim(`${filtered.length} options`)}`);
      }
    }

    if (opts.filterable && query.length === 0 && opts.placeholder) {
      lines.push(`  ${ansi.dim(FLOW_PIPE)} ${ansi.dim(opts.placeholder)}`);
    } else if (opts.allowMultiple) {
      lines.push(`  ${ansi.dim(FLOW_PIPE)} ${ansi.dim("Space to toggle, Enter to confirm")}`);
    } else {
      lines.push(`  ${ansi.dim(FLOW_PIPE)} ${ansi.dim("Use arrows and press Enter")}`);
    }

    stdout.write(lines.join("\n"));
    renderedLines = lines.length;
  };

  const cleanup = (): void => {
    if (renderedLines > 0) clearRenderedLines(renderedLines);
    stdin.setRawMode(previousRawMode);
    stdin.removeListener("keypress", onKeypress);
    restoreKeypressListeners();
    // Pause stdin to stop raw-mode keypress processing, but do NOT unref —
    // the caller may invoke another prompt (e.g. pagination loops), and
    // unref lets Node exit prematurely. In REPL mode, skip pause entirely
    // to avoid triggering readline's 'close' event.
    if (!previousRawMode) {
      stdin.pause();
    }
  };

  const commitSingleLine = (text: string): void => {
    if (opts.commitLabel === null) return;
    const label = opts.commitLabel ?? opts.message;
    console.log(`  ${ansi.green("◆")} ${label}: ${text}`);
  };

  const onKeypress = (str: string, key: readline.Key): void => {
    const filtered = getFiltered();
    const current = filtered[cursor];
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      cleanup();
      resolver({ value: null, cancelled: true });
      return;
    }
    if (key.name === "return") {
      if (opts.allowMultiple) {
        if (opts.required && selected.size === 0) return;
        cleanup();
        const values = Array.from(selected);
        const labels = opts.options
          .filter((o) => values.includes(o.value))
          .map((o) => optionLabel(o))
          .join(", ");
        commitSingleLine(labels || "none");
        resolver({ value: values, cancelled: false });
        return;
      }
      if (!current || current.disabled) return;
      cleanup();
      commitSingleLine(optionLabel(current));
      resolver({ value: current.value, cancelled: false });
      return;
    }
    if (opts.allowMultiple && key.name === "space") {
      if (!current || current.disabled) return;
      if (selected.has(current.value)) selected.delete(current.value);
      else selected.add(current.value);
      render();
      return;
    }
    if (key.name === "up") {
      if (filtered.length === 0) return;
      let next = cursor - 1;
      while (next >= 0 && filtered[next]?.disabled) next -= 1;
      if (next >= 0) cursor = next;
      render();
      return;
    }
    if (key.name === "down") {
      if (filtered.length === 0) return;
      let next = cursor + 1;
      while (next < filtered.length && filtered[next]?.disabled) next += 1;
      if (next < filtered.length) cursor = next;
      render();
      return;
    }
    if (opts.filterable && key.name === "backspace") {
      if (query.length > 0) {
        query = query.slice(0, -1);
        render();
      }
      return;
    }
    if (opts.filterable && str && !key.ctrl && !key.meta && str >= " " && str !== "\x7f") {
      query += str;
      cursor = 0;
      render();
    }
  };

  let resolver!: (result: RenderResult) => void;
  const done = new Promise<RenderResult>((resolve) => {
    resolver = resolve;
  });
  stdin.on("keypress", onKeypress);
  render();
  return done;
}

export async function promptText(opts: {
  message: string;
  placeholder?: string;
  initialValue?: string;
  defaultValue?: string;
  cancelMessage?: string;
  clearAfterSubmit?: boolean;
}): Promise<string | null> {
  if (!stdin.isTTY || !stdout.isTTY) {
    return opts.defaultValue ?? opts.initialValue ?? "";
  }
  stdin.resume();
  (stdin as NodeJS.ReadStream & { ref?: () => void }).ref?.();
  const restoreKeypressListeners = suspendStdinKeypressListeners();
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  console.log(`  ${ansi.dim(FLOW_PIPE)}`);
  const question = `  ${ansi.cyan("◆")} ${opts.message}${opts.placeholder ? ` ${ansi.dim(`(${opts.placeholder})`)}` : ""}: `;
  const previousRawMode = stdin.isRaw;
  if (previousRawMode) stdin.setRawMode(false);
  const value = await new Promise<string | null>((resolve) => {
    rl.on("SIGINT", () => resolve(null));
    rl.question(question, (answer) => resolve(answer));
  });
  rl.close();
  restoreKeypressListeners();
  if (previousRawMode) stdin.setRawMode(true);
  if (opts.clearAfterSubmit) {
    // Clear the prompt line and spacer line so sensitive/temporary
    // prompt input does not remain visible after submit.
    clearRenderedLines(2);
  }
  if (value === null) {
    printCancel(opts.cancelMessage);
    return null;
  }
  if (!value.trim() && opts.defaultValue !== undefined) return opts.defaultValue;
  if (!value.trim() && opts.initialValue !== undefined) return opts.initialValue;
  return value;
}

export async function promptConfirm(opts: {
  message: string;
  initialValue?: boolean;
  cancelMessage?: string;
}): Promise<boolean | null> {
  const defaultYes = opts.initialValue ?? true;
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await promptText({
    message: `${opts.message} ${suffix}`,
    cancelMessage: opts.cancelMessage,
  });
  if (answer === null) return null;
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return defaultYes;
  if (normalized === "y" || normalized === "yes") return true;
  if (normalized === "n" || normalized === "no") return false;
  return defaultYes;
}

export async function promptSelect<T extends string>(opts: {
  message: string;
  options: PromptOption<T>[];
  initialValue?: T;
  cancelMessage?: string;
  commitLabel?: string | null;
}): Promise<T | null> {
  const result = await runListPrompt({
    message: opts.message,
    options: opts.options,
    initialValue: opts.initialValue,
    commitLabel: opts.commitLabel ?? "Selected",
  });
  if (result.cancelled) {
    printCancel(opts.cancelMessage);
    return null;
  }
  return result.value as T;
}

export async function promptAutocomplete<T extends string>(opts: {
  message: string;
  options: PromptOption<T>[];
  initialValue?: T;
  placeholder?: string;
  cancelMessage?: string;
  commitLabel?: string | null;
}): Promise<T | null> {
  const result = await runListPrompt({
    message: opts.message,
    options: opts.options,
    initialValue: opts.initialValue,
    placeholder: opts.placeholder,
    filterable: true,
    commitLabel: opts.commitLabel ?? "Selected",
  });
  if (result.cancelled) {
    printCancel(opts.cancelMessage);
    return null;
  }
  return result.value as T;
}

export async function promptMultiselect<T extends string>(opts: {
  message: string;
  options: PromptOption<T>[];
  required?: boolean;
  cancelMessage?: string;
}): Promise<T[] | null> {
  const result = await runListPrompt({
    message: opts.message,
    options: opts.options,
    allowMultiple: true,
    required: opts.required,
    commitLabel: "Selected",
  });
  if (result.cancelled) {
    printCancel(opts.cancelMessage);
    return null;
  }
  return result.value as T[];
}

export async function runWithSpinner<T>(
  label: string,
  doneLabel: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!stdout.isTTY) return fn();

  // Diamond-part spin sequence (left -> top -> right -> bottom).
  const spinFrames = ["⬖", "⬘", "⬗", "⬙"];
  let tick = 0;
  const render = () => {
    readline.clearLine(stdout, 0);
    readline.cursorTo(stdout, 0);
    const spin = spinFrames[tick % spinFrames.length];
    stdout.write(`  ${ansi.dim(FLOW_PIPE)} ${ansi.purple(spin)} ${label}`);
    tick += 1;
  };
  render();
  const timer = setInterval(render, 160);
  try {
    const result = await fn();
    clearInterval(timer);
    readline.clearLine(stdout, 0);
    readline.cursorTo(stdout, 0);
    stdout.write(`  ${ansi.green("◆")} ${doneLabel}\n`);
    return result;
  } catch (err) {
    clearInterval(timer);
    readline.clearLine(stdout, 0);
    readline.cursorTo(stdout, 0);
    stdout.write(`  ${ansi.red("✗")} ${label}\n`);
    throw err;
  }
}
