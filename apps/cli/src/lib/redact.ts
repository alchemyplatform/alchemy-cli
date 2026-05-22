import { getBaseDomain } from "./client-utils.js";

export const SENSITIVE_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "INVALID_API_KEY",
  "INVALID_ACCESS_KEY",
  "ACCESS_KEY_REQUIRED",
]);

export function getAlchemyKeyPathMarkers(): string[] {
  const domain = getBaseDomain();
  return [`${domain}/v2/`, `${domain}/nft/v3/`];
}

export function isSecretBoundaryChar(char: string): boolean {
  return (
    char === "/" ||
    char === "?" ||
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === '"' ||
    char === "'" ||
    char === "`"
  );
}

export function redactAfterMarker(input: string, marker: string): string {
  const lower = input.toLowerCase();
  let index = 0;
  let cursor = 0;
  let out = "";

  while (index < input.length) {
    const markerIndex = lower.indexOf(marker, index);
    if (markerIndex === -1) break;

    const secretStart = markerIndex + marker.length;
    let secretEnd = secretStart;
    while (secretEnd < input.length && !isSecretBoundaryChar(input[secretEnd])) {
      secretEnd += 1;
    }

    out += input.slice(cursor, secretStart);
    out += "[REDACTED]";
    cursor = secretEnd;
    index = secretEnd;
  }

  if (!out) return input;
  return out + input.slice(cursor);
}

export function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const marker of getAlchemyKeyPathMarkers()) {
    redacted = redactAfterMarker(redacted, marker);
  }
  return redacted;
}
