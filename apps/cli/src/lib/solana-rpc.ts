import { CLIError, ErrorCode } from "./errors.js";
import { debug } from "./output.js";

type SolanaClient = {
  call(method: string, params: unknown): Promise<unknown>;
};

export type SolanaRpcFamily = "rpc" | "das";

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

function errorText(err: unknown): string {
  if (err instanceof CLIError) {
    return [err.message, err.details].filter(Boolean).join(" ");
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function solanaRpcFamilyForMethod(method: string): SolanaRpcFamily {
  return SOLANA_DAS_METHODS.has(method) ? "das" : "rpc";
}

export function normalizeSolanaDasPaywallError(err: unknown): CLIError | null {
  if (err instanceof CLIError && err.code === ErrorCode.PAYMENT_REQUIRED) {
    return err;
  }

  const detail = errorText(err);
  if (!/\b(free tier|payg|paid tier|paid plan|upgrade|plan does not|current plan|not available on your plan)\b/i.test(detail)) {
    return null;
  }

  return new CLIError(
    ErrorCode.PAYMENT_REQUIRED,
    "Solana DAS request requires a paid Alchemy plan.",
    "Upgrade your app to PAYG or use a plan with Solana DAS access at https://dashboard.alchemy.com/.",
    detail || undefined,
  );
}

export async function callSolana(
  client: SolanaClient,
  family: SolanaRpcFamily,
  method: string,
  params: unknown,
): Promise<unknown> {
  const startedAt = Date.now();
  debug(`solana ${family} ${method} params`, params);
  try {
    const result = await client.call(method, params);
    debug(`solana ${family} ${method} ok ${Date.now() - startedAt}ms`);
    return result;
  } catch (err) {
    debug(`solana ${family} ${method} failed ${Date.now() - startedAt}ms`, errorText(err));
    throw err;
  }
}
