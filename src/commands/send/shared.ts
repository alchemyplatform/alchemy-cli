import { Command } from "commander";
import { clientFromFlags } from "../../lib/resolve.js";
import { errInvalidArgs } from "../../lib/errors.js";

export function parseAmount(amount: string, decimals: number): bigint {
  if (!amount || amount.trim() === "") {
    throw errInvalidArgs("Amount is required.");
  }
  const trimmed = amount.trim();
  if (trimmed.startsWith("-")) {
    throw errInvalidArgs("Amount must be a positive number.");
  }

  const parts = trimmed.split(".");
  if (parts.length > 2) {
    throw errInvalidArgs(`Invalid amount "${trimmed}".`);
  }

  const whole = parts[0] || "0";
  let fractional = parts[1] || "";

  if (fractional.length > decimals) {
    throw errInvalidArgs(
      `Too many decimal places for this token (max ${decimals}).`,
    );
  }

  fractional = fractional.padEnd(decimals, "0");

  const raw = whole + fractional;
  try {
    const value = BigInt(raw);
    if (value === 0n) {
      throw errInvalidArgs("Amount must be greater than zero.");
    }
    return value;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Amount must be")) throw err;
    throw errInvalidArgs(`Invalid amount "${trimmed}".`);
  }
}

export function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const str = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export async function fetchTokenDecimals(
  program: Command,
  tokenAddress: string,
): Promise<{ decimals: number; symbol: string }> {
  const client = clientFromFlags(program);
  const result = await client.call("alchemy_getTokenMetadata", [tokenAddress]) as {
    decimals: number | null;
    symbol: string | null;
  };

  if (result.decimals == null) {
    throw errInvalidArgs(`Could not fetch decimals for token ${tokenAddress}. Is it a valid ERC-20 contract on this network?`);
  }

  return {
    decimals: result.decimals,
    symbol: result.symbol ?? tokenAddress,
  };
}
