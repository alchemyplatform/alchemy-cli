import { stdout, stderr } from "node:process";
import { esc } from "./colors.js";

const dim = esc("2");

const MAX_LINES = 5000;
const SCROLL_STEP = 3;

// ANSI escape regex for measuring visible length (strip colors, cursor moves, etc.)
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function visibleLength(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function centerPad(text: string, width: number): string {
  const vis = visibleLength(text);
  if (vis >= width) return text;
  const left = Math.floor((width - vis) / 2);
  return " ".repeat(left) + text;
}

export class ScrollbackBuffer {
  private lines: string[] = [];
  private scrollOffset = 0;
  private origStdoutWrite: typeof stdout.write;
  private origStderrWrite: typeof stderr.write;
  private partial = "";
  private promptStr = "";

  constructor() {
    this.origStdoutWrite = stdout.write.bind(stdout);
    this.origStderrWrite = stderr.write.bind(stderr);
    const self = this;

    const wrapStream = (
      orig: typeof stdout.write,
    ): typeof stdout.write =>
      function (chunk: Uint8Array | string, ...rest: unknown[]): boolean {
        const str = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        self.capture(str);
        if (self.scrollOffset > 0) return true;
        return orig(chunk, ...(rest as [BufferEncoding, () => void]));
      } as typeof stdout.write;

    stdout.write = wrapStream(this.origStdoutWrite);
    stderr.write = wrapStream(this.origStderrWrite);
  }

  private capture(data: string): void {
    // Normalize \r\n (line endings) to \n so they aren't mistaken for
    // standalone \r (carriage-return overwrite used by spinners).
    const text = (this.partial + data).replace(/\r\n/g, "\n");
    const segments = text.split("\n");
    this.partial = segments.pop() ?? "";

    for (const seg of segments) {
      // Standalone \r means "return to start of line" — only the content
      // after the last \r is visible, so discard everything before it.
      const crIdx = seg.lastIndexOf("\r");
      this.lines.push(crIdx >= 0 ? seg.slice(crIdx + 1) : seg);
    }

    const crIdx = this.partial.lastIndexOf("\r");
    if (crIdx > 0) this.partial = this.partial.slice(crIdx);

    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(-MAX_LINES);
    }
  }

  setPrompt(prompt: string): void {
    this.promptStr = prompt;
  }

  get isScrolled(): boolean {
    return this.scrollOffset > 0;
  }

  get offset(): number {
    return this.scrollOffset;
  }

  scrollUp(): void {
    const rows = stdout.rows ?? 24;
    const viewRows = rows - 2;
    const maxOffset = Math.max(0, this.lines.length - viewRows);
    if (maxOffset === 0) return;
    this.scrollOffset = Math.min(this.scrollOffset + SCROLL_STEP, maxOffset);
    this.render();
  }

  scrollDown(): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - SCROLL_STEP);
    if (this.scrollOffset === 0) {
      this.renderBottom();
    } else {
      this.render();
    }
  }

  snapToBottom(): void {
    if (this.scrollOffset === 0) return;
    this.scrollOffset = 0;
    this.renderBottom();
  }

  private render(): void {
    const cols = stdout.columns ?? 80;
    const rows = stdout.rows ?? 24;
    const viewRows = rows - 2;
    const endIdx = this.lines.length - this.scrollOffset;
    const startIdx = Math.max(0, endIdx - viewRows);
    const visible = this.lines.slice(startIdx, endIdx);

    this.origStdoutWrite("\x1b[H");
    for (const line of visible) {
      this.origStdoutWrite("\x1b[2K" + line + "\n");
    }

    const linesAbove = startIdx;
    const linesBelow = Math.max(0, this.lines.length - endIdx);
    const indicator = dim(
      centerPad(`─── ↑ ${linesAbove} above · ${linesBelow} below ───`, cols),
    );
    this.origStdoutWrite("\x1b[2K" + indicator + "\n");
    this.origStdoutWrite("\x1b[2K" + this.promptStr);
    this.origStdoutWrite("\x1b[J");
  }

  private renderBottom(): void {
    const rows = stdout.rows ?? 24;
    const viewRows = rows - 1;
    const startIdx = Math.max(0, this.lines.length - viewRows);
    const visible = this.lines.slice(startIdx);

    this.origStdoutWrite("\x1b[H");
    for (const line of visible) {
      this.origStdoutWrite("\x1b[2K" + line + "\n");
    }
    this.origStdoutWrite("\x1b[2K");
    this.origStdoutWrite("\x1b[J");
  }

  rawWrite(data: string): void {
    this.origStdoutWrite(data);
  }

  updateLastLine(content: string): void {
    if (this.lines.length > 0) {
      this.lines[this.lines.length - 1] = content;
    }
  }

  removeLastLines(count: number): void {
    this.lines.splice(-count, count);
  }

  rewriteLastLine(content: string): void {
    if (this.lines.length === 0) return;
    this.lines[this.lines.length - 1] = content;
    if (this.scrollOffset === 0) {
      this.origStdoutWrite("\x1b[1A\x1b[2K" + content + "\n");
    }
  }

  dispose(): void {
    if (this.partial) {
      this.lines.push(this.partial);
      this.partial = "";
    }
    stdout.write = this.origStdoutWrite as typeof stdout.write;
    stderr.write = this.origStderrWrite as typeof stderr.write;
  }
}
