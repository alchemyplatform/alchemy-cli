import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errNotFound } from "../lib/errors.js";
import * as output from "../lib/output.js";
import { exitWithError } from "../index.js";
import { validateTxHash, readStdinArg } from "../lib/validators.js";
import {
  green,
  successBadge,
  failBadge,
  withSpinner,
  weiToEth,
  etherscanTxURL,
  printKeyValueBox,
} from "../lib/ui.js";

function isVerboseEnabled(): boolean {
  try {
    return Boolean((output as { verbose?: boolean }).verbose);
  } catch {
    return false;
  }
}

export function registerTx(program: Command) {
  program
    .command("tx [hash]")
    .description("Get transaction details by hash")
    .addHelpText(
      "after",
      `
Examples:
  alchemy tx 0xabc123...
  echo 0xabc123... | alchemy tx`,
    )
    .action(async (hashArg?: string) => {
      try {
        const hash = hashArg ?? (await readStdinArg("hash"));
        validateTxHash(hash);

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

        if (output.isJSONMode()) {
          output.printJSON({ transaction: tx, receipt });
          return;
        }

        const pairs: Array<[string, string]> = [["Hash", hash]];
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
          pairs.push(["Explorer", explorerURL]);
        }

        printKeyValueBox(pairs);

        if (isVerboseEnabled()) {
          console.log("");
          output.printJSON({ transaction: tx, receipt });
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
