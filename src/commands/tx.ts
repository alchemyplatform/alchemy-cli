import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import {
  dim,
  brand,
  green,
  successBadge,
  failBadge,
  withSpinner,
  weiToEth,
  etherscanTxURL,
} from "../lib/ui.js";

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

        const [tx, receipt] = await withSpinner("Fetching transaction…", "Transaction fetched", async () => {
          const t = (await client.call("eth_getTransactionByHash", [
            hash,
          ])) as Record<string, unknown> | null;
          if (!t) throw errNotFound(`transaction ${hash}`);
          const r = (await client.call("eth_getTransactionReceipt", [
            hash,
          ])) as Record<string, unknown> | null;
          return [t, r] as const;
        });

        if (isJSONMode()) {
          printJSON({ transaction: tx, receipt });
          return;
        }

        console.log(`${dim("Transaction:")} ${brand(hash)}`);
        if (tx.from) console.log(`${dim("From:")}        ${tx.from}`);
        if (tx.to) console.log(`${dim("To:")}          ${tx.to}`);
        if (tx.value) {
          const wei = BigInt(tx.value as string);
          console.log(`${dim("Value:")}       ${green(weiToEth(wei) + " ETH")}`);
        }
        if (tx.blockNumber) console.log(`${dim("Block:")}       ${tx.blockNumber}`);
        if (receipt) {
          if (receipt.status === "0x1") {
            console.log(`${dim("Status:")}      ${successBadge()} Success`);
          } else if (receipt.status) {
            console.log(`${dim("Status:")}      ${failBadge()} Failed`);
          }
          if (receipt.gasUsed) console.log(`${dim("Gas Used:")}    ${receipt.gasUsed}`);
        }

        const network = resolveNetwork(program);
        const explorerURL = etherscanTxURL(hash, network);
        if (explorerURL) {
          console.log(`${dim("Explorer:")}    ${brand(explorerURL)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
