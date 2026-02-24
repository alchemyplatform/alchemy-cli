import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";

export function registerTx(program: Command) {
  program
    .command("tx <hash>")
    .description("Get transaction details by hash")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tx 0xabc123...`,
    )
    .action(async (hash: string) => {
      try {
        if (!hash.startsWith("0x")) {
          throw errInvalidArgs("transaction hash must start with 0x");
        }

        const client = clientFromFlags(program);

        const tx = (await client.call("eth_getTransactionByHash", [
          hash,
        ])) as Record<string, unknown> | null;
        if (!tx) throw errNotFound(`transaction ${hash}`);

        const receipt = (await client.call("eth_getTransactionReceipt", [
          hash,
        ])) as Record<string, unknown> | null;

        if (isJSONMode()) {
          printJSON({ transaction: tx, receipt });
          return;
        }

        console.log(`Transaction: ${hash}`);
        if (tx.from) console.log(`From:        ${tx.from}`);
        if (tx.to) console.log(`To:          ${tx.to}`);
        if (tx.value) console.log(`Value:       ${tx.value} (wei)`);
        if (tx.blockNumber) console.log(`Block:       ${tx.blockNumber}`);
        if (receipt) {
          if (receipt.status === "0x1") {
            console.log(`Status:      Success`);
          } else if (receipt.status) {
            console.log(`Status:      Failed`);
          }
          if (receipt.gasUsed) console.log(`Gas Used:    ${receipt.gasUsed}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
