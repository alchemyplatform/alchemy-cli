import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { validateAddress, readStdinArg, splitCommaList } from "../lib/validators.js";
import { dim, withSpinner, printTable, emptyState } from "../lib/ui.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { promptSelect } from "../lib/terminal-ui.js";

interface Transfer {
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  blockNum: string;
  hash: string;
  metadata?: { blockTimestamp?: string };
}

interface TransferResult {
  transfers: Transfer[];
  pageKey?: string;
}

type PaginationAction = "next" | "stop";

async function promptTransfersPagination(shown: number): Promise<PaginationAction> {
  const action = await promptSelect({
    message: `${shown} transfers loaded — more available`,
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

const TABLE_HEADERS = ["Block", "From", "To", "Value", "Asset", "Category"];

function formatTransferRows(transfers: Transfer[]): string[][] {
  return transfers.map((t) => {
    const block = t.blockNum ? String(parseInt(t.blockNum, 16)) : dim("—");
    const from = t.from ? `${t.from.slice(0, 8)}…${t.from.slice(-4)}` : dim("—");
    const to = t.to ? `${t.to.slice(0, 8)}…${t.to.slice(-4)}` : dim("contract creation");
    const value = t.value !== null && t.value !== undefined ? String(t.value) : dim("—");
    const asset = t.asset ?? dim("—");
    const category = t.category;
    return [block, from, to, value, asset, category];
  });
}

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
    .option("--max-count <hexOrDecimal>", "Max records to return per page")
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
          baseFilter.maxCount = "0x19";
        }
        if (opts.pageKey) baseFilter.pageKey = opts.pageKey;

        const filter = { ...baseFilter };
        if (address && !opts.fromAddress && !opts.toAddress) {
          filter.fromAddress = address;
        } else {
          if (opts.fromAddress) filter.fromAddress = opts.fromAddress;
          if (opts.toAddress) filter.toAddress = opts.toAddress;
        }

        const result = await withSpinner("Fetching transfers…", "Transfers fetched", () =>
          client.call("alchemy_getAssetTransfers", [filter]),
        ) as TransferResult;

        if (isJSONMode()) {
          printJSON(result);
          return;
        }

        let totalShown = result.transfers.length;

        if (totalShown === 0) {
          emptyState("No transfers found.");
          return;
        }

        console.log(`${totalShown} transfer${totalShown === 1 ? "" : "s"}\n`);
        printTable(TABLE_HEADERS, formatTransferRows(result.transfers));

        const interactive = isInteractiveAllowed(program);
        let pageKey = result.pageKey;

        while (pageKey && interactive) {
          const action = await promptTransfersPagination(totalShown);
          if (action === "stop") {
            console.log(`\n  ${dim(`Next page key: ${pageKey}`)}`);
            break;
          }

          filter.pageKey = pageKey;
          const nextResult = await withSpinner("Fetching next page…", "Page fetched", () =>
            client.call("alchemy_getAssetTransfers", [filter]),
          ) as TransferResult;

          if (nextResult.transfers.length > 0) {
            totalShown += nextResult.transfers.length;
            console.log(`\n${totalShown} transfers total\n`);
            printTable(TABLE_HEADERS, formatTransferRows(nextResult.transfers));
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
}
