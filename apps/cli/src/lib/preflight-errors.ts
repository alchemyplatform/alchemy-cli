import { CLIError, ErrorCode, errPreflightRevert } from "./errors.js";

function errorText(err: unknown): string {
  if (err instanceof CLIError) {
    return [err.message, err.details].filter(Boolean).join(" ");
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function cleanReason(value: string): string {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRevertReason(text: string): string | null {
  const patterns = [
    /An error occurred while executing user operation:\s*["'`]?([^"'`\n]+)["'`]?/i,
    /reverted with the following reason:\s*["'`]?([^"'`\n]+)["'`]?/i,
    /execution reverted(?::|[ \t]+with reason string)[ \t]*["'`]?([^"'`\n]+)["'`]?/i,
    /reverted with (?:the )?reason(?: string)?:?[ \t]*["'`]?([^"'`\n]+)["'`]?/i,
    /\breason:[ \t]*["'`]?([^"'`\n]+)["'`]?/i,
    /\brevert(?:ed)?[: \t]+["'`]?([^"'`\n]+)["'`]?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const reason = match?.[1] ? cleanReason(match[1]) : "";
    if (reason) return reason;
  }

  if (/\b(revert|reverted|execution reverted|call exception)\b/i.test(text)) {
    return "execution reverted";
  }

  return null;
}

export function normalizePreflightRevertError(err: unknown): CLIError | null {
  if (err instanceof CLIError && err.code === ErrorCode.PREFLIGHT_REVERT) {
    return err;
  }

  const detail = errorText(err);
  const reason = extractRevertReason(detail);
  if (!reason) return null;
  return errPreflightRevert(reason, detail || undefined);
}

export async function withPreflightRevert<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw normalizePreflightRevertError(err) ?? err;
  }
}
