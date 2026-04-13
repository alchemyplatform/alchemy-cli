import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable, emptyState, printSyntaxJSON } from "../lib/ui.js";
import { validateAddress, resolveAddress, readStdinArg } from "../lib/validators.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { promptSelect } from "../lib/terminal-ui.js";

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

type PaginationAction = "next" | "stop";

async function promptNFTPagination(shown: number, total: number): Promise<PaginationAction> {
  const action = await promptSelect({
    message: `Showing ${shown} of ${total} NFTs`,
    options: [
      { label: "Load next page", value: "next" },
      { label: "Stop here", value: "stop" },
    ],
    initialValue: "next",
    cancelMessage: "Stopped pagination.",
  });
  if (action === null) return "stop";
  return action as PaginationAction;
}

function formatNFTRows(nfts: NFTResponse["ownedNfts"]): string[][] {
  return nfts.map((nft) => [
    nft.contract.name || dim("unnamed"),
    nft.name || `#${nft.tokenId}`,
    nft.contract.address,
  ]);
}

export function registerNFTs(program: Command) {
  const cmd = program
    .command("nfts")
    .description("NFT API wrappers")
    .argument("[address]", "Wallet address or ENS name (default action: list owned NFTs)")
    .option("--limit <n>", "Maximum number of NFTs to return per page", parseInt)
    .option("--page-key <key>", "Pagination key from a previous response")
    .addHelpText(
      "after",
      `
Examples:
  alchemy data nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy data nfts metadata --contract 0x... --token-id 1
  alchemy data nfts contract 0x...
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy data nfts`,
    )
    .action(async (addressArg: string | undefined, opts: { limit?: number; pageKey?: string }) => {
      try {
        const addressInput = addressArg ?? (await readStdinArg("address"));
        const client = clientFromFlags(program);
        const address = await resolveAddress(addressInput, client);

        const params: Record<string, string> = {
          owner: address,
          withMetadata: "true",
        };
        if (opts.limit) params.pageSize = String(opts.limit);
        if (opts.pageKey) params.pageKey = opts.pageKey;

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

        let shown = result.ownedNfts.length;
        printTable(["Collection", "Name", "Contract"], formatNFTRows(result.ownedNfts));

        if (verbose) {
          console.log("");
          printJSON(result);
        }

        const interactive = isInteractiveAllowed(program);
        let pageKey = result.pageKey;

        while (pageKey && interactive) {
          const action = await promptNFTPagination(shown, result.totalCount);
          if (action === "stop") {
            console.log(`\n  ${dim(`Next page key: ${pageKey}`)}`);
            break;
          }

          const nextParams: Record<string, string> = {
            owner: address,
            withMetadata: "true",
            pageKey,
          };
          if (opts.limit) nextParams.pageSize = String(opts.limit);

          const nextResult = await withSpinner("Fetching next page…", "Page fetched", () =>
            client.callEnhanced("getNFTsForOwner", nextParams),
          ) as NFTResponse;

          if (nextResult.ownedNfts.length > 0) {
            printTable(["Collection", "Name", "Contract"], formatNFTRows(nextResult.ownedNfts));
            shown += nextResult.ownedNfts.length;
          }

          pageKey = nextResult.pageKey;
        }

        if (pageKey && !interactive) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${pageKey} to see the next page.`)}`);
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
