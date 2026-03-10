export const forceColor =
  "FORCE_COLOR" in process.env && process.env.FORCE_COLOR !== "0";

export const noColor =
  !forceColor &&
  ("NO_COLOR" in process.env || process.env.TERM === "dumb");

export const identity = (s: string) => s;

export const esc = (code: string) =>
  noColor ? identity : (s: string) => `\x1b[${code}m${s}\x1b[0m`;

export const rgb = (r: number, g: number, b: number) =>
  noColor ? identity : (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;

export const bgRgb = (r: number, g: number, b: number) =>
  noColor ? identity : (s: string) => `\x1b[48;2;${r};${g};${b}m${s}\x1b[49m`;
