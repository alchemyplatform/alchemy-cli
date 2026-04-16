import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { callApiData } from "../lib/rest.js";
import { resolveAPIKey, resolveX402Client } from "../lib/resolve.js";

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

export function registerPortfolio(program: Command) {
  const cmd = program.command("portfolio").description("Portfolio API wrappers");

  cmd
    .command("tokens")
    .description("Returns a full cross-network portfolio of all ERC-20 token holdings and USD values for a wallet address. USE WHEN: user asks for portfolio overview, all tokens held, or assets across multiple networks. For NFTs only, use `alchemy nfts`. For native ETH balance only, use `alchemy balance`.")
    .requiredOption("--body <json>", "JSON body for /assets/tokens/by-address")
    .action(async (opts: { body: string }) => {
      try {
        const result = await runDataCall(
          program,
          "token portfolio",
          "/assets/tokens/by-address",
          JSON.parse(opts.body),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("token-balances")
    .description("Get token balances by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/tokens/balances/by-address")
    .action(async (opts: { body: string }) => {
      try {
        const result = await runDataCall(
          program,
          "token balances",
          "/assets/tokens/balances/by-address",
          JSON.parse(opts.body),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("nfts")
    .description("Returns all NFTs owned by a wallet address across one or more networks. Use to list all NFTs a wallet holds in a portfolio view. For metadata on a specific NFT by contract + token ID, use `alchemy nfts metadata`.")
    .requiredOption("--body <json>", "JSON body for /assets/nfts/by-address")
    .action(async (opts: { body: string }) => {
      try {
        const result = await runDataCall(
          program,
          "NFT portfolio",
          "/assets/nfts/by-address",
          JSON.parse(opts.body),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("nft-contracts")
    .description("Get NFT contracts by address/network pairs")
    .requiredOption("--body <json>", "JSON body for /assets/nfts/contracts/by-address")
    .action(async (opts: { body: string }) => {
      try {
        const result = await runDataCall(
          program,
          "NFT contracts",
          "/assets/nfts/contracts/by-address",
          JSON.parse(opts.body),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

}
