export const forceColor =
  "FORCE_COLOR" in process.env && process.env.FORCE_COLOR !== "0";

export let noColor =
  !forceColor &&
  ("NO_COLOR" in process.env || process.env.TERM === "dumb");

/** Called from the preAction hook when --no-color is passed. */
export function setNoColor(value: boolean): void {
  noColor = value;
}

export const identity = (s: string) => s;

// Check noColor lazily (at render time) so --no-color flag takes effect
// even after color helpers have been assigned to module-level constants.
export const esc = (code: string) =>
  (s: string) => (noColor ? s : `\x1b[${code}m${s}\x1b[0m`);

export const rgb = (r: number, g: number, b: number) =>
  (s: string) => (noColor ? s : `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`);

export const bgRgb = (r: number, g: number, b: number) =>
  (s: string) => (noColor ? s : `\x1b[48;2;${r};${g};${b}m${s}\x1b[49m`);
