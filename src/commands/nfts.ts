import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";

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
    .command("nfts <address>")
    .description("List NFTs owned by an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`,
    )
    .action(async (address: string) => {
      try {
        if (!address.startsWith("0x")) {
          throw errInvalidArgs("address must start with 0x");
        }

        const client = clientFromFlags(program);
        const result = (await client.callEnhanced("getNFTsForOwner", {
          owner: address,
          withMetadata: "true",
        })) as NFTResponse;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        console.log(`NFTs for ${address} (${result.totalCount} total)\n`);
        for (const nft of result.ownedNfts) {
          const name = nft.name || `#${nft.tokenId}`;
          const collection = nft.contract.name || nft.contract.address;
          console.log(`  ${collection} — ${name}`);
        }
        if (result.ownedNfts.length === 0) {
          console.log("  No NFTs found.");
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
