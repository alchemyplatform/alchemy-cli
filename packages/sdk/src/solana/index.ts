export type SolanaRpcFamily = "rpc" | "das";

export interface SolanaDasPaywallErrorInfo {
  message: string;
  hint: string;
  details?: string;
}

const SOLANA_DAS_METHODS = new Set([
  "getAsset",
  "getAssetsByOwner",
  "searchAssets",
  "getTokenAccounts",
  "getAssets",
  "getAssetProof",
  "getAssetsByAuthority",
  "getAssetsByGroup",
  "getAssetsByCreator",
  "getAssetSignatures",
  "getNftEditions",
]);

const SOLANA_DAS_PAYWALL_PATTERN =
  /\b(free tier|payg|paid tier|paid plan|upgrade|plan does not|current plan|not available on your plan)\b/i;

export function isSolanaDasMethod(method: string): boolean {
  return SOLANA_DAS_METHODS.has(method);
}

export function solanaRpcFamilyForMethod(method: string): SolanaRpcFamily {
  return isSolanaDasMethod(method) ? "das" : "rpc";
}

export function classifySolanaDasPaywallError(
  err: unknown,
): SolanaDasPaywallErrorInfo | undefined {
  const details = errorText(err);
  if (!SOLANA_DAS_PAYWALL_PATTERN.test(details)) {
    return undefined;
  }

  return {
    message: "Solana DAS request requires a paid Alchemy plan.",
    hint: "Upgrade your app to PAYG or use a plan with Solana DAS access at https://dashboard.alchemy.com/.",
    ...(details && { details }),
  };
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const details = stringValue((err as { details?: unknown }).details);
    return [err.message, details].filter(Boolean).join(" ");
  }
  return String(err);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
