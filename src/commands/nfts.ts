import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { dim, withSpinner, printTable, emptyState } from "../lib/ui.js";
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
  program
    .command("nfts [address]")
    .description("List NFTs owned by an address")
    .option("--limit <n>", "Maximum number of NFTs to return", parseInt)
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --limit 10
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

        if (result.pageKey) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${result.pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
