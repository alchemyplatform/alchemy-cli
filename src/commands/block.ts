import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound, exitWithError } from "../lib/errors.js";
import { isJSONMode, printJSON, verbose } from "../lib/output.js";
import {
  formatBlockTimestamp,
  formatHexQuantity,
  formatGasSummary,
} from "../lib/block-format.js";
import {
  bold,
  dim,
  withSpinner,
  printKeyValueBox,
  printSyntaxJSON,
} from "../lib/ui.js";

export function registerBlock(program: Command) {
  program
    .command("block <number>")
    .description("Get block details by number")
    .addHelpText(
      "after",
      `
Examples:
  alchemy block latest
  alchemy block 17000000
  alchemy block 0x1`,
    )
    .action(async (blockId: string) => {
      try {
        let blockParam: string;
        if (["latest", "earliest", "pending"].includes(blockId)) {
          blockParam = blockId;
        } else if (blockId.startsWith("0x")) {
          blockParam = blockId;
        } else {
          const num = parseInt(blockId, 10);
          if (isNaN(num)) {
            throw errInvalidArgs(
              "block must be a number, hex, or 'latest'",
            );
          }
          if (num < 0) {
            throw errInvalidArgs("Block number must be non-negative.");
          }
          blockParam = `0x${num.toString(16)}`;
        }

        const client = clientFromFlags(program);
        const block = await withSpinner("Fetching block…", "Block fetched", () =>
          client.call("eth_getBlockByNumber", [blockParam, false]),
        ) as Record<string, unknown> | null;

        if (!block) throw errNotFound(`block ${blockId}`);

        if (isJSONMode()) {
          printJSON(block);
          return;
        }

        const pairs: Array<[string, string]> = [];
        if (block.number) {
          const formatted = formatHexQuantity(block.number);
          pairs.push(["Block", bold(formatted ?? String(block.number))]);
        }
        if (block.hash) pairs.push(["Hash", String(block.hash)]);
        if (block.timestamp) {
          const ts = formatBlockTimestamp(block.timestamp);
          if (ts) pairs.push(["Timestamp", ts]);
        }
        if (Array.isArray(block.transactions)) {
          const txCount = block.transactions.length.toLocaleString("en-US");
          pairs.push(["Transactions", txCount]);
        }
        if (block.miner) pairs.push(["Miner", String(block.miner)]);
        const gasSummary = formatGasSummary(block.gasUsed, block.gasLimit, { colored: true });
        if (gasSummary) {
          pairs.push(["Gas", gasSummary]);
        } else {
          if (block.gasUsed) {
            const formatted = formatHexQuantity(block.gasUsed);
            pairs.push(["Gas Used", formatted ?? String(block.gasUsed)]);
          }
          if (block.gasLimit) {
            const formatted = formatHexQuantity(block.gasLimit);
            pairs.push(["Gas Limit", formatted ?? String(block.gasLimit)]);
          }
        }

        printKeyValueBox(pairs);

        if (verbose) {
          console.log("");
          printSyntaxJSON(block);
        } else {
          console.log("");
          console.log(`  ${dim("Tip: use --verbose to include the raw block payload.")}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
