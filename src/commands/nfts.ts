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
}

export function registerNFTs(program: Command) {
  program
    .command("nfts [address]")
    .description("List NFTs owned by an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy nfts`,
    )
    .action(async (addressArg?: string) => {
      try {
        const address = addressArg ?? readStdinArg("address");
        validateAddress(address);

        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching NFTs…", "NFTs fetched", () =>
          client.callEnhanced("getNFTsForOwner", {
            owner: address,
            withMetadata: "true",
          }),
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
      } catch (err) {
        exitWithError(err);
      }
    });
}
