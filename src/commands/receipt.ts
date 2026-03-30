import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errNotFound, exitWithError } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { validateTxHash, readStdinArg } from "../lib/validators.js";
import {
  dim,
  green,
  red,
  successBadge,
  failBadge,
  withSpinner,
  etherscanTxURL,
  printKeyValueBox,
} from "../lib/ui.js";
import { formatHexQuantity, formatGwei } from "../lib/block-format.js";

export function registerReceipt(program: Command) {
  program
    .command("receipt")
    .argument("[hash]", "Transaction hash (0x...) or pipe via stdin")
    .description("Get transaction receipt (status, gas used, logs)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy receipt 0xabc123...
  echo 0xabc123... | alchemy receipt

Tip: use 'alchemy tx <hash>' for transaction details (value, block, nonce). Receipt provides execution results (status, gas used, logs).`,
    )
    .action(async (hashArg?: string) => {
      try {
        const hash = hashArg ?? (await readStdinArg("hash"));
        validateTxHash(hash);

        const client = clientFromFlags(program);
        const receipt = await withSpinner("Fetching receipt…", "Receipt fetched", () =>
          client.call("eth_getTransactionReceipt", [hash]),
        ) as Record<string, unknown> | null;

        if (!receipt) throw errNotFound(`receipt for ${hash}`);

        if (isJSONMode()) {
          printJSON(receipt);
          return;
        }

        const pairs: Array<[string, string]> = [["Hash", hash]];

        if (receipt.status === "0x1") {
          pairs.push(["Status", `${successBadge()} ${green("Success")}`]);
        } else if (receipt.status) {
          pairs.push(["Status", `${failBadge()} ${red("Failed")}`]);
        }

        if (receipt.from) pairs.push(["From", String(receipt.from)]);
        if (receipt.to) pairs.push(["To", String(receipt.to)]);

        if (receipt.contractAddress) {
          pairs.push(["Contract Created", String(receipt.contractAddress)]);
        }

        if (receipt.blockNumber) {
          const hex = String(receipt.blockNumber);
          const decoded = formatHexQuantity(hex);
          pairs.push(["Block", decoded ? `${decoded} ${dim(`(${hex})`)}` : hex]);
        }

        if (receipt.gasUsed) {
          const hex = String(receipt.gasUsed);
          const decoded = formatHexQuantity(hex);
          pairs.push(["Gas Used", decoded ? `${decoded} ${dim(`(${hex})`)}` : hex]);
        }

        if (receipt.effectiveGasPrice) {
          const hex = String(receipt.effectiveGasPrice);
          const wei = BigInt(hex);
          const gwei = Number(wei) / 1e9;
          pairs.push(["Gas Price", `${formatGwei(gwei)} gwei ${dim(`(${hex})`)}`]);
        }

        if (Array.isArray(receipt.logs)) {
          pairs.push(["Logs", `${receipt.logs.length} event${receipt.logs.length === 1 ? "" : "s"}`]);
        }

        const network = resolveNetwork(program);
        const explorerURL = etherscanTxURL(hash, network);
        if (explorerURL) {
          pairs.push(["Explorer", explorerURL]);
        }

        printKeyValueBox(pairs);
      } catch (err) {
        exitWithError(err);
      }
    });
}
