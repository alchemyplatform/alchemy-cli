import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { validateAddress, readStdinArg, splitCommaList } from "../lib/validators.js";
import { dim, withSpinner, printSyntaxJSON } from "../lib/ui.js";

export function registerTransfers(program: Command) {
  program
    .command("transfers")
    .argument("[address]", "Wallet address — queries outgoing transfers (use --to-address for incoming)")
    .description("Get transfer history (alchemy_getAssetTransfers)")
    .option("--from-address <address>", "Filter sender address")
    .option("--to-address <address>", "Filter recipient address")
    .option("--from-block <block>", "Start block (default: 0x0)")
    .option("--to-block <block>", "End block (default: latest)")
    .option("--category <list>", "Comma-separated categories (erc20,erc721,erc1155,external,internal,specialnft)")
    .option("--max-count <hexOrDecimal>", "Max records to return")
    .option("--page-key <key>", "Pagination key")
    .addHelpText(
      "after",
      `
Examples:
  # Outgoing transfers from an address
  alchemy transfers 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

  # Incoming transfers to an address
  alchemy transfers --to-address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

  # Outgoing ERC-20 transfers only
  alchemy transfers --from-address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --category erc20

  # Transfers within a block range
  alchemy transfers 0xd8dA... --from-block 0x100000 --to-block latest`,
    )
    .action(async (addressArg: string | undefined, opts) => {
      try {
        const client = clientFromFlags(program);
        const address = addressArg ?? undefined;
        if (address) validateAddress(address);
        if (opts.fromAddress) validateAddress(opts.fromAddress);
        if (opts.toAddress) validateAddress(opts.toAddress);

        const baseFilter: Record<string, unknown> = {
          fromBlock: opts.fromBlock ?? "0x0",
          toBlock: opts.toBlock ?? "latest",
          withMetadata: true,
          category: opts.category
            ? splitCommaList(opts.category)
            : ["external", "internal", "erc20", "erc721", "erc1155", "specialnft"],
        };

        if (opts.maxCount) {
          baseFilter.maxCount = opts.maxCount.startsWith("0x")
            ? opts.maxCount
            : `0x${Number.parseInt(opts.maxCount, 10).toString(16)}`;
        } else if (!isJSONMode()) {
          // Default to 25 in human mode to keep terminal output manageable
          baseFilter.maxCount = "0x19";
        }
        if (opts.pageKey) baseFilter.pageKey = opts.pageKey;

        const filter = { ...baseFilter };
        if (address && !opts.fromAddress && !opts.toAddress) {
          // Bare address defaults to outgoing transfers (fromAddress).
          // Use --to-address for incoming, or both flags for bidirectional.
          filter.fromAddress = address;
        } else {
          if (opts.fromAddress) filter.fromAddress = opts.fromAddress;
          if (opts.toAddress) filter.toAddress = opts.toAddress;
        }

        const result = await withSpinner("Fetching transfers…", "Transfers fetched", () =>
          client.call("alchemy_getAssetTransfers", [filter]),
        );

        if (isJSONMode()) {
          printJSON(result);
        } else {
          printSyntaxJSON(result);
          const pageKey = (result as Record<string, unknown>)?.pageKey;
          if (pageKey) {
            console.log(`\n  ${dim(`More results available. Use --page-key ${pageKey} to see the next page.`)}`);
          }
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
