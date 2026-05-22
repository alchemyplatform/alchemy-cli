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
    return value.slice(0, limit);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        Array.isArray(nested) ? nested.slice(0, limit) : nested,
      ]),
    );
  }
  return value;
}

async function runPortfolioCommand(
  program: Command,
  title: string,
  path: string,
  opts: PortfolioOpts,
): Promise<void> {
  const limit = parseOptionalInt(opts.limit, "--limit");
  const result = await runDataCall(program, title, path, JSON.parse(opts.body));
  const output = limitPayload(result, limit);
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
