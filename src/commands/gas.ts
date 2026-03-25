import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON, verbose } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { withSpinner, printKeyValueBox } from "../lib/ui.js";
import { formatGwei, formatGweiWithRaw } from "../lib/block-format.js";

/**
 * Convert wei (BigInt) to gwei (number). Uses BigInt arithmetic for the
 * integer part to avoid floating-point precision loss when the value
 * exceeds Number.MAX_SAFE_INTEGER, then adds back the fractional part.
 */
function weiToGwei(wei: bigint): number {
  const GWEI = 1_000_000_000n;
  const whole = wei / GWEI;
  const remainder = wei % GWEI;
  return Number(whole) + Number(remainder) / 1e9;
}

export function registerGas(program: Command) {
  program
    .command("gas")
    .description("Get current gas prices (base fee + priority fee)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy gas
  alchemy gas -n polygon-mainnet
  alchemy gas --json`,
    )
    .action(async () => {
      try {
        const client = clientFromFlags(program);

        const [gasPrice, maxPriorityFee] = await withSpinner(
          "Fetching gas prices…",
          "Gas prices fetched",
          async () => {
            const [gp, mpf] = await Promise.all([
              client.call("eth_gasPrice", []) as Promise<string>,
              client.call("eth_maxPriorityFeePerGas", []).catch(() => null) as Promise<string | null>,
            ]);
            return [gp, mpf] as const;
          },
        );

        const network = resolveNetwork(program);
        const gasPriceWei = BigInt(gasPrice);
        const gasPriceGwei = weiToGwei(gasPriceWei);

        let priorityFeeGwei: number | null = null;
        if (maxPriorityFee) {
          const priorityFeeWei = BigInt(maxPriorityFee);
          priorityFeeGwei = weiToGwei(priorityFeeWei);
        }

        if (isJSONMode()) {
          const json: Record<string, unknown> = {
            gasPrice: gasPrice,
            gasPriceGwei: formatGwei(gasPriceGwei),
            network,
          };
          if (maxPriorityFee && priorityFeeGwei !== null) {
            json.maxPriorityFeePerGas = maxPriorityFee;
            json.maxPriorityFeePerGasGwei = formatGwei(priorityFeeGwei);
          }
          printJSON(json);
        } else {
          const pairs: Array<[string, string]> = [];

          const gasPriceFormatted = formatGweiWithRaw(gasPrice);
          pairs.push(["Gas Price", gasPriceFormatted ?? `${formatGwei(gasPriceGwei)} gwei`]);

          if (maxPriorityFee && priorityFeeGwei !== null) {
            const priorityFormatted = formatGweiWithRaw(maxPriorityFee);
            pairs.push(["Priority Fee", priorityFormatted ?? `${formatGwei(priorityFeeGwei)} gwei`]);
          }

          pairs.push(["Network", network]);

          printKeyValueBox(pairs);

          if (verbose) {
            console.log("");
            const verboseData: Record<string, unknown> = {
              rpcMethod: "eth_gasPrice",
              rpcResult: gasPrice,
            };
            if (maxPriorityFee) {
              verboseData.rpcMethod2 = "eth_maxPriorityFeePerGas";
              verboseData.rpcResult2 = maxPriorityFee;
            }
            printJSON(verboseData);
          }
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
