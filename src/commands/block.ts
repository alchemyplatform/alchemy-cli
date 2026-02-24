import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { bold, brand, dim, withSpinner, timeAgo, printHeader, printKeyValue } from "../lib/ui.js";

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

        printHeader("Block");

        const pairs: Array<[string, string]> = [];
        if (block.number) pairs.push(["Block", bold(String(block.number))]);
        if (block.hash) pairs.push(["Hash", brand(String(block.hash))]);
        if (block.timestamp) {
          const ts = String(block.timestamp);
          pairs.push(["Timestamp", `${ts} ${dim("(" + timeAgo(ts) + ")")}`]);
        }
        if (Array.isArray(block.transactions))
          pairs.push(["Transactions", String(block.transactions.length)]);
        if (block.miner) pairs.push(["Miner", String(block.miner)]);
        if (block.gasUsed) pairs.push(["Gas Used", String(block.gasUsed)]);
        if (block.gasLimit) pairs.push(["Gas Limit", String(block.gasLimit)]);

        printKeyValue(pairs);
      } catch (err) {
        exitWithError(err);
      }
    });
}
