import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { errInvalidArgs } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";

function weiToEth(wei: bigint): string {
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  const remainder = wei % divisor;

  if (remainder === 0n) return `${whole}.0`;

  const remStr = remainder.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${remStr}`;
}

export function registerBalance(program: Command) {
  program
    .command("balance <address>")
    .description("Get the ETH balance of an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n polygon-mainnet`,
    )
    .action(async (address: string) => {
      try {
        if (!address.startsWith("0x")) {
          throw errInvalidArgs("address must start with 0x");
        }

        const client = clientFromFlags(program);
        const result = (await client.call("eth_getBalance", [
          address,
          "latest",
        ])) as string;

        const wei = BigInt(result);
        const network = resolveNetwork(program);

        if (isJSONMode()) {
          printJSON({
            address,
            wei: wei.toString(),
            eth: weiToEth(wei),
            network,
          });
        } else {
          console.log(`Address: ${address}`);
          console.log(`Balance: ${weiToEth(wei)} ETH`);
          console.log(`Network: ${network}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
