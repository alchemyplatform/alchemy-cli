import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { bold, brand, dim, withSpinner, timeAgo } from "../lib/ui.js";

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

        if (block.number) console.log(`${dim("Block:")}        ${bold(String(block.number))}`);
        if (block.hash) console.log(`${dim("Hash:")}         ${brand(String(block.hash))}`);
        if (block.timestamp) {
          const ts = String(block.timestamp);
          console.log(`${dim("Timestamp:")}    ${ts} ${dim("(" + timeAgo(ts) + ")")}`);
        }
        if (Array.isArray(block.transactions))
          console.log(`${dim("Transactions:")} ${block.transactions.length}`);
        if (block.miner) console.log(`${dim("Miner:")}        ${block.miner}`);
        if (block.gasUsed) console.log(`${dim("Gas Used:")}     ${block.gasUsed}`);
        if (block.gasLimit) console.log(`${dim("Gas Limit:")}    ${block.gasLimit}`);
      } catch (err) {
        exitWithError(err);
      }
    });
}
