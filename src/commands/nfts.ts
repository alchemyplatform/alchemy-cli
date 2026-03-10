import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable, emptyState, printSyntaxJSON } from "../lib/ui.js";
import { validateAddress, readStdinArg } from "../lib/validators.js";

interface NFTResponse {
  ownedNfts: Array<{
    contract: { address: string; name?: string };
    tokenId: string;
    name?: string;
    description?: string;
  }>;
  totalCount: number;
  pageKey?: string;
}

export function registerNFTs(program: Command) {
  const cmd = program
    .command("nfts")
    .description("NFT API wrappers")
    .argument("[address]", "Wallet address (default action: list owned NFTs)")
    .option("--limit <n>", "Maximum number of NFTs to return", parseInt)
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy nfts metadata --contract 0x... --token-id 1
  alchemy nfts contract 0x...
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy nfts`,
    )
    .action(async (addressArg: string | undefined, opts: { limit?: number; pageKey?: string }) => {
      try {
        const address = addressArg ?? (await readStdinArg("address"));
        validateAddress(address);

        const params: Record<string, string> = {
          owner: address,
          withMetadata: "true",
        };
        if (opts.limit) params.pageSize = String(opts.limit);
        if (opts.pageKey) params.pageKey = opts.pageKey;

        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching NFTs…", "NFTs fetched", () =>
          client.callEnhanced("getNFTsForOwner", params),
        ) as NFTResponse;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        if (result.ownedNfts.length === 0) {
          emptyState("No NFTs found.");
          return;
        }

        const rows = result.ownedNfts.map((nft) => [
          nft.contract.name || dim("unnamed"),
          nft.name || `#${nft.tokenId}`,
          nft.contract.address,
        ]);

        printTable(["Collection", "Name", "Contract"], rows);

        if (verbose) {
          console.log("");
          printJSON(result);
        }

        if (result.pageKey) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${result.pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("metadata")
    .description("Get NFT metadata by contract/token")
    .requiredOption("--contract <address>", "NFT contract address")
    .requiredOption("--token-id <id>", "Token id")
    .action(async (opts: { contract: string; tokenId: string }) => {
      try {
        validateAddress(opts.contract);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching NFT metadata…", "NFT metadata fetched", () =>
          client.callEnhanced("getNFTMetadata", {
            contractAddress: opts.contract,
            tokenId: opts.tokenId,
          }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("contract <address>")
    .description("Get NFT contract metadata")
    .action(async (address: string) => {
      try {
        validateAddress(address);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching contract metadata…", "Contract metadata fetched", () =>
          client.callEnhanced("getContractMetadata", {
            contractAddress: address,
          }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
