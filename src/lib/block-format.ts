import { dim, timeAgo, weiToEth } from "./ui.js";

export function parseHexQuantity(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/i.test(value)) {
    return undefined;
  }
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

export function formatWithCommas(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatHexQuantity(value: unknown): string | undefined {
  const parsed = parseHexQuantity(value);
  if (parsed === undefined) return undefined;
  return formatWithCommas(parsed);
}

export function formatBlockTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseHexQuantity(value);
  if (parsed === undefined) return undefined;
  const millis = Number(parsed) * 1000;
  if (!Number.isFinite(millis)) return undefined;
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return undefined;
  const iso = d.toISOString().replace(".000Z", "Z");
  return `${iso} ${dim("(" + timeAgo(value) + ")")}`;
}

/**
 * Format a hex quantity with both decoded and raw hex: "21,000 (0x5208)"
 */
export function formatHexWithRaw(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseHexQuantity(value);
  if (parsed === undefined) return undefined;
  return `${formatWithCommas(parsed)} ${dim(`(${value})`)}`;
}

/**
 * Format a wei value as ETH with raw hex: "0.01 ETH (0x2386f26fc10000)"
 */
export function formatWeiWithRaw(value: unknown, symbol = "ETH"): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseHexQuantity(value);
  if (parsed === undefined) return undefined;
  return `${weiToEth(parsed)} ${symbol} ${dim(`(${value})`)}`;
}

/**
 * Format a wei value as gwei with raw hex: "1.50 gwei (0x59682f00)"
 */
/**
 * Format a gwei value with enough precision to show meaningful digits.
 * Uses 2 decimal places for values >= 1 gwei, otherwise shows up to 9
 * significant fractional digits so sub-gwei values aren't rounded to "0.00".
 */
/**
 * Format a gwei value without truncating — strip only trailing zeros.
 */
export function formatGwei(gwei: number): string {
  // 9 decimal places = full wei precision in gwei
  const fixed = gwei.toFixed(9);
  // Strip trailing zeros but keep at least one decimal place for clarity
  return fixed.replace(/\.?0+$/, "") || "0";
}

export function formatGweiWithRaw(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = parseHexQuantity(value);
  if (parsed === undefined) return undefined;
  const gwei = Number(parsed) / 1e9;
  return `${formatGwei(gwei)} gwei ${dim(`(${value})`)}`;
}

export function formatGasSummary(
  gasUsed: unknown,
  gasLimit: unknown,
  options?: { colored?: boolean },
): string | undefined {
  const used = parseHexQuantity(gasUsed);
  const limit = parseHexQuantity(gasLimit);
  if (used === undefined || limit === undefined) return undefined;

  const usedFormatted = formatWithCommas(used);
  const limitFormatted = formatWithCommas(limit);
  if (limit === 0n) return `${usedFormatted} / ${limitFormatted}`;

  const bps = (used * 10_000n) / limit;
  const percent = Number(bps) / 100;
  const percentText = `${percent.toFixed(2)}%`;
  const percentDisplay = options?.colored ? dim(percentText) : percentText;
  return `${usedFormatted} / ${limitFormatted} (${percentDisplay})`;
}
