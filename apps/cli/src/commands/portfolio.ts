import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { callApiData } from "../lib/rest.js";
import { resolveAPIKey, resolveX402Client } from "../lib/resolve.js";
import { parseOptionalInt } from "../lib/params.js";

interface PortfolioOpts {
  body: string;
  limit?: string;
}

const BALANCE_FIELD_NAMES = new Set([
  "balance",
  "tokenbalance",
  "rawbalance",
  "rawtokenbalance",
  "amount",
]);

async function runDataCall(
  program: Command,
  title: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  const x402 = resolveX402Client(program);
  return withSpinner(`Fetching ${title}…`, `${title} fetched`, () =>
    x402
      ? x402.callRest(`data/v1${path}`, { method: "POST", body })
      : callApiData(resolveAPIKey(program), path, { method: "POST", body }),
  );
}

function limitPayload(value: unknown, limit: number | undefined): unknown {
  if (limit === undefined) return value;
  if (Array.isArray(value)) {
    return value.slice(0, limit).map((item) => limitPayload(item, limit));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        limitPayload(nested, limit),
      ]),
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHexQuantity(value: string): boolean {
  return /^0x[0-9a-f]+$/i.test(value);
}

function parseDecimals(value: unknown): number | undefined {
  const decimals = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : undefined;
  if (decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    return undefined;
  }
  return decimals;
}

function decimalsForRecord(value: Record<string, unknown>): number | undefined {
  const direct = parseDecimals(value.decimals);
  if (direct !== undefined) return direct;

  for (const key of ["tokenMetadata", "metadata", "token"]) {
    const nested = value[key];
    if (isRecord(nested)) {
      const decimals = parseDecimals(nested.decimals);
      if (decimals !== undefined) return decimals;
    }
  }

  return undefined;
}

function formatRawAmount(raw: bigint, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function shouldNormalizeBalanceField(key: string): boolean {
  const normalized = key.toLowerCase();
  return BALANCE_FIELD_NAMES.has(normalized) || normalized.endsWith("balance");
}

function normalizePortfolioOutput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizePortfolioOutput);
  }

  if (!isRecord(value)) {
    return value;
  }

  const decimals = decimalsForRecord(value);
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = normalizePortfolioOutput(nested);

    if (typeof nested !== "string" || !shouldNormalizeBalanceField(key) || !isHexQuantity(nested)) {
      continue;
    }

    const raw = BigInt(nested);
    output[`${key}Decimal`] = raw.toString();
    if (decimals !== undefined) {
      output[`${key}Formatted`] = formatRawAmount(raw, decimals);
    }
  }

  return output;
}

async function runPortfolioCommand(
  program: Command,
  title: string,
  path: string,
  opts: PortfolioOpts,
): Promise<void> {
  const limit = parseOptionalInt(opts.limit, "--limit");
  const result = await runDataCall(program, title, path, JSON.parse(opts.body));
  const output = normalizePortfolioOutput(limitPayload(result, limit));
  if (isJSONMode()) printJSON(output);
  else printSyntaxJSON(output);
}

export function registerPortfolio(program: Command) {
  const cmd = program.command("portfolio").description("Portfolio API wrappers");

  cmd
    .command("tokens")
    .description("Get token portfolio by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/tokens/by-address")
    .option("--limit <n>", "Limit arrays in output")
    .action(async (opts: PortfolioOpts) => {
      try {
        await runPortfolioCommand(
          program,
          "token portfolio",
          "/assets/tokens/by-address",
          opts,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("token-balances")
    .description("Get token balances by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/tokens/balances/by-address")
    .option("--limit <n>", "Limit arrays in output")
    .action(async (opts: PortfolioOpts) => {
      try {
        await runPortfolioCommand(
          program,
          "token balances",
          "/assets/tokens/balances/by-address",
          opts,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("nfts")
    .description("Get NFT portfolio by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/nfts/by-address")
    .option("--limit <n>", "Limit arrays in output")
    .action(async (opts: PortfolioOpts) => {
      try {
        await runPortfolioCommand(
          program,
          "NFT portfolio",
          "/assets/nfts/by-address",
          opts,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("nft-contracts")
    .description("Get NFT contracts by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/nfts/contracts/by-address")
    .option("--limit <n>", "Limit arrays in output")
    .action(async (opts: PortfolioOpts) => {
      try {
        await runPortfolioCommand(
          program,
          "NFT contracts",
          "/assets/nfts/contracts/by-address",
          opts,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

}
