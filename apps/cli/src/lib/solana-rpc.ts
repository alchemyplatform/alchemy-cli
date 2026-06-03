import {
  classifySolanaDasPaywallError,
  type SolanaRpcFamily as SharedSolanaRpcFamily,
} from "@alchemy/sdk/solana";
import { CLIError, ErrorCode } from "./errors.js";
import { debug } from "./output.js";

export {
  solanaRpcFamilyForMethod,
  type SolanaRpcFamily,
} from "@alchemy/sdk/solana";

type SolanaClient = {
  call(method: string, params: unknown): Promise<unknown>;
};

function errorText(err: unknown): string {
  if (err instanceof CLIError) {
    return [err.message, err.details].filter(Boolean).join(" ");
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function normalizeSolanaDasPaywallError(err: unknown): CLIError | null {
  if (err instanceof CLIError && err.code === ErrorCode.PAYMENT_REQUIRED) {
    return err;
  }

  const paywall = classifySolanaDasPaywallError(err);
  if (!paywall) {
    return null;
  }

  return new CLIError(
    ErrorCode.PAYMENT_REQUIRED,
    paywall.message,
    paywall.hint,
    paywall.details,
  );
}

export async function callSolana(
  client: SolanaClient,
  family: SharedSolanaRpcFamily,
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
