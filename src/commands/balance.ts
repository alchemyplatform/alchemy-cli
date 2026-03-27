import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { errInvalidArgs, exitWithError } from "../lib/errors.js";
import { green, withSpinner, weiToEth, printKeyValueBox } from "../lib/ui.js";
import { resolveAddress, readStdinLines } from "../lib/validators.js";
import { nativeTokenSymbol } from "../lib/networks.js";

async function fetchBalance(
  program: Command,
  addressInput: string,
  blockParam: string,
): Promise<void> {
  const client = clientFromFlags(program);
  const address = await resolveAddress(addressInput, client);

  const result = await withSpinner("Fetching balance…", "Balance fetched", () =>
    client.call("eth_getBalance", [address, blockParam]),
  ) as string;

  const wei = BigInt(result);
  const network = resolveNetwork(program);
  const symbol = nativeTokenSymbol(network);

  if (isJSONMode()) {
    printJSON({
      address,
      wei: wei.toString(),
      balance: weiToEth(wei),
      symbol,
      network,
    });
  } else {
    printKeyValueBox([
      ["Address", address],
      ["Balance", green(`${weiToEth(wei)} ${symbol}`)],
      ["Network", network],
    ]);

    if (verbose) {
      console.log("");
      printJSON({
        rpcMethod: "eth_getBalance",
        rpcParams: [address, blockParam],
        rpcResult: result,
      });
    }
  }
}

function resolveBlockParam(block?: string): string {
  let blockParam = block ?? "latest";
  if (blockParam !== "latest" && blockParam !== "earliest" && blockParam !== "pending") {
    if (!blockParam.startsWith("0x")) {
      const num = parseInt(blockParam, 10);
      if (isNaN(num) || num < 0) {
        throw errInvalidArgs("Block must be a number, hex, or tag (latest, earliest, pending).");
      }
      blockParam = `0x${num.toString(16)}`;
    }
  }
  return blockParam;
}

export function registerBalance(program: Command) {
  program
    .command("balance")
    .argument("[address]", "Wallet address (0x...) or ENS name, or pipe via stdin")
    .alias("bal")
    .description("Get the native token balance of an address")
    .addHelpText(
      "after",
      `
Examples:
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n polygon-mainnet
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy balance
  alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --block 15537393
  alchemy balance vitalik.eth
  cat addresses.txt | alchemy balance`,
    )
    .option("--block <block>", "Block number, hex, or tag (default: latest)")
    .action(async (addressArg?: string, opts?: { block?: string }) => {
      try {
        const blockParam = resolveBlockParam(opts?.block);

        if (addressArg) {
          await fetchBalance(program, addressArg, blockParam);
          return;
        }

        // No positional arg — read from stdin (supports multiple lines)
        const lines = await readStdinLines("address");
        for (const line of lines) {
          try {
            await fetchBalance(program, line, blockParam);
          } catch (err) {
            exitWithError(err);
          }
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
