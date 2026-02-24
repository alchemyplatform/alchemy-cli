import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import {
  green,
  brand,
  successBadge,
  failBadge,
  withSpinner,
  weiToEth,
  etherscanTxURL,
  printHeader,
  printKeyValue,
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

        printHeader("Transaction");

        const pairs: Array<[string, string]> = [["Hash", brand(hash)]];
        if (tx.from) pairs.push(["From", String(tx.from)]);
        if (tx.to) pairs.push(["To", String(tx.to)]);
        if (tx.value) {
          const wei = BigInt(tx.value as string);
          pairs.push(["Value", green(weiToEth(wei) + " ETH")]);
        }
        if (tx.blockNumber) pairs.push(["Block", String(tx.blockNumber)]);
        if (receipt) {
          if (receipt.status === "0x1") {
            pairs.push(["Status", `${successBadge()} Success`]);
          } else if (receipt.status) {
            pairs.push(["Status", `${failBadge()} Failed`]);
          }
          if (receipt.gasUsed) pairs.push(["Gas Used", String(receipt.gasUsed)]);
        }

        const network = resolveNetwork(program);
        const explorerURL = etherscanTxURL(hash, network);
        if (explorerURL) {
          pairs.push(["Explorer", brand(explorerURL)]);
        }

        printKeyValue(pairs);
      } catch (err) {
        exitWithError(err);
      }
    });
}
