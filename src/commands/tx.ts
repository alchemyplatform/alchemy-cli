import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errNotFound, exitWithError } from "../lib/errors.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { validateTxHash, readStdinArg } from "../lib/validators.js";
import {
  green,
  successBadge,
  failBadge,
  withSpinner,
  etherscanTxURL,
  printKeyValueBox,
} from "../lib/ui.js";
import { formatHexWithRaw, formatWeiWithRaw, formatGweiWithRaw } from "../lib/block-format.js";
import { nativeTokenSymbol } from "../lib/networks.js";

export function registerTx(program: Command) {
  program
    .command("tx")
    .argument("[hash]", "Transaction hash (0x...) or pipe via stdin")
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

        if (isJSONMode()) {
          printJSON({ transaction: tx, receipt });
          return;
        }

        const network = resolveNetwork(program);
        const symbol = nativeTokenSymbol(network);

        const pairs: Array<[string, string]> = [["Hash", hash]];
        if (tx.from) pairs.push(["From", String(tx.from)]);
        if (tx.to) pairs.push(["To", String(tx.to)]);
        if (tx.value) {
          const formatted = formatWeiWithRaw(tx.value, symbol);
          pairs.push(["Value", formatted ? green(formatted) : String(tx.value)]);
        }
        if (tx.blockNumber) {
          const formatted = formatHexWithRaw(tx.blockNumber);
          pairs.push(["Block", formatted ?? String(tx.blockNumber)]);
        }
        if (receipt) {
          if (receipt.status === "0x1") {
            pairs.push(["Status", `${successBadge()} Success`]);
          } else if (receipt.status) {
            pairs.push(["Status", `${failBadge()} Failed`]);
          }
          if (receipt.gasUsed) {
            const formatted = formatHexWithRaw(receipt.gasUsed);
            pairs.push(["Gas Used", formatted ?? String(receipt.gasUsed)]);
          }
          if (receipt.effectiveGasPrice) {
            const formatted = formatGweiWithRaw(receipt.effectiveGasPrice);
            pairs.push(["Gas Price", formatted ?? String(receipt.effectiveGasPrice)]);
          }
        }

        const explorerURL = etherscanTxURL(hash, network);
        if (explorerURL) {
          pairs.push(["Explorer", explorerURL]);
        }

        printKeyValueBox(pairs);

        if (verbose) {
          console.log("");
          printJSON({ transaction: tx, receipt });
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
