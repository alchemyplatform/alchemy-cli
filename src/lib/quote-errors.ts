import { CLIError, ErrorCode } from "./errors.js";

export type QuoteFlow = "swap" | "bridge";

export type QuoteFailureCause =
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_LIQUIDITY"
  | "UNSUPPORTED_ROUTE"
  | "QUOTE_REVERTED"
  | "QUOTE_FAILED";

function errorText(err: unknown): string {
  if (err instanceof CLIError) {
    return [err.message, err.details].filter(Boolean).join(" ");
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function classifyQuoteFailure(text: string): QuoteFailureCause {
  const lower = text.toLowerCase();

  if (
    /liquidity|no route|route not found|cannot find route|unable to find route|no quote/.test(lower)
  ) {
    return "INSUFFICIENT_LIQUIDITY";
  }

  if (
    /insufficient (funds|balance)|exceeds balance|not enough (funds|balance)|balance too low/.test(lower)
  ) {
    return "INSUFFICIENT_BALANCE";
  }

  if (/unsupported|not supported|unsupported route|unsupported token|unsupported chain|unsupported network/.test(lower)) {
    return "UNSUPPORTED_ROUTE";
  }

  if (/execution reverted|revert|call exception|internal json-rpc|rpc error|-32603/.test(lower)) {
    return "QUOTE_REVERTED";
  }

  return "QUOTE_FAILED";
}

function quoteMessage(flow: QuoteFlow, cause: QuoteFailureCause): string {
  const label = flow === "swap" ? "Swap" : "Bridge";
  switch (cause) {
    case "INSUFFICIENT_BALANCE":
      return `${label} quote unavailable: insufficient balance for the requested amount.`;
    case "INSUFFICIENT_LIQUIDITY":
      return `${label} quote unavailable: no route or insufficient liquidity for this trade.`;
    case "UNSUPPORTED_ROUTE":
      return `${label} quote unavailable: unsupported token, chain, or route.`;
    case "QUOTE_REVERTED":
      return `${label} quote unavailable: quote simulation reverted.`;
    case "QUOTE_FAILED":
      return `${label} quote unavailable.`;
  }
}

function quoteHint(flow: QuoteFlow, cause: QuoteFailureCause): string {
  switch (cause) {
    case "INSUFFICIENT_BALANCE":
      return "Lower --amount or quote from an address that holds enough source token.";
    case "INSUFFICIENT_LIQUIDITY":
      return flow === "swap"
        ? "Try a smaller --amount, different tokens, or a different mainnet."
        : "Try a smaller --amount, different tokens, or a different destination network.";
    case "UNSUPPORTED_ROUTE":
      return flow === "swap"
        ? "Check token addresses and use an EVM mainnet supported by swap."
        : "Check token addresses and source/destination EVM mainnets.";
    case "QUOTE_REVERTED":
      return "Try a smaller --amount or different route. Use --json for typed error details.";
    case "QUOTE_FAILED":
      return "Retry later or try a different amount, token, or network.";
  }
}

export function normalizeQuoteError(err: unknown, flow: QuoteFlow): CLIError {
  if (
    err instanceof CLIError &&
    err.code !== ErrorCode.RPC_ERROR &&
    err.code !== ErrorCode.INTERNAL_ERROR
  ) {
    return err;
  }

  const detail = errorText(err);
  const cause = classifyQuoteFailure(detail);

  return new CLIError(
    ErrorCode.QUOTE_FAILED,
    quoteMessage(flow, cause),
    quoteHint(flow, cause),
    detail || undefined,
    { cause },
  );
}
