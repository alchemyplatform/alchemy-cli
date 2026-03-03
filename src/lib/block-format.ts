import { dim, timeAgo } from "./ui.js";

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

export function formatGasSummary(
  gasUsed: unknown,
  gasLimit: unknown,
): string | undefined {
  const used = parseHexQuantity(gasUsed);
  const limit = parseHexQuantity(gasLimit);
  if (used === undefined || limit === undefined) return undefined;

  const usedFormatted = formatWithCommas(used);
  const limitFormatted = formatWithCommas(limit);
  if (limit === 0n) return `${usedFormatted} / ${limitFormatted}`;

  const bps = (used * 10_000n) / limit;
  const percent = Number(bps) / 100;
  return `${usedFormatted} / ${limitFormatted} (${percent.toFixed(2)}%)`;
}
