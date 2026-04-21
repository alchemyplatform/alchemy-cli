import { Command } from "commander";
import { resolveNetwork } from "../../lib/resolve.js";
import { isSolanaNetwork } from "../../lib/networks.js";
import { exitWithError } from "../../lib/errors.js";
import { performEvmSend } from "./evm.js";
import { performSolanaSend } from "./solana.js";

export function registerSend(program: Command) {
  program
    .command("send")
    .description("Send native tokens or ERC-20 tokens to an address")
    .argument("<to>", "Recipient address (0x... or Solana base58)")
    .argument("<amount>", "Amount to send (human-readable, e.g. 1.5)")
    .option("--token <address>", "ERC-20 token contract address (omit for native token)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy send 0xAbC...123 1.5                          Send 1.5 ETH
  alchemy send vitalik.eth 0.1 -n base-mainnet          Send 0.1 ETH on Base
  alchemy send 0xAbC...123 100 --token 0xA0b8...USDC    Send 100 USDC
  alchemy send 0xAbC...123 1 --gas-sponsored --gas-policy-id <id>
  alchemy send <solana-addr> 0.5 -n solana-devnet       Send 0.5 SOL`,
    )
    .action(async (toArg: string, amountArg: string, opts: { token?: string }) => {
      try {
        const network = resolveNetwork(program);
        if (isSolanaNetwork(network)) {
          await performSolanaSend(program, toArg, amountArg, opts.token);
        } else {
          await performEvmSend(program, toArg, amountArg, opts.token);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
