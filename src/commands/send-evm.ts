import { Command } from "commander";
import { encodeFunctionData, type Address as EvmAddress, erc20Abi } from "viem";
import { buildWalletClient } from "../lib/smart-wallet.js";
import { clientFromFlags } from "../lib/resolve.js";
import { resolveAddress, validateAddress } from "../lib/validators.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { withSpinner, printKeyValueBox, green } from "../lib/ui.js";
import { addSignerOption, parseSignerOpt } from "../lib/params.js";
import { fetchTokenDecimals, parseAmount } from "../lib/token-amounts.js";

const NATIVE_EVM_DECIMALS = 18;

export function registerEvmSend(program: Command) {
  const sendCmd = program
    .command("send")
    .description("Send native tokens or ERC-20 tokens to an address")
    .argument("<to>", "Recipient address (0x... or ENS name)")
    .argument("<amount>", "Amount to send (human-readable, e.g. 1.5)")
    .option("--token <address>", "ERC-20 token contract address (omit for native token)");
  addSignerOption(sendCmd);
  sendCmd
    .option("--gas-sponsored", "Enable gas sponsorship (env: ALCHEMY_GAS_SPONSORED)")
    .option("--gas-policy-id <id>", "Gas policy ID for sponsorship (env: ALCHEMY_GAS_POLICY_ID)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy evm send 0xAbC...123 1.5                          Send 1.5 ETH
  alchemy evm send vitalik.eth 0.1 -n base-mainnet          Send 0.1 ETH on Base
  alchemy evm send 0xAbC...123 100 --token 0xA0b8...USDC    Send 100 USDC
  alchemy evm send 0xAbC...123 1 --gas-sponsored --gas-policy-id <id>
  alchemy evm send 0xAbC...123 1.5 --signer local           Force the local wallet`,
    )
    .action(async (toArg: string, amountArg: string, _opts: unknown, cmd: Command) => {
      try {
        const opts = cmd.opts<{ token?: string; signer?: string }>();
        await performEvmSend(cmd, toArg, amountArg, opts.token, {
          signer: parseSignerOpt(opts.signer),
        });
      } catch (err) {
        const { exitWithError } = await import("../lib/errors.js");
        exitWithError(err);
      }
    });
}

export async function performEvmSend(
  program: Command,
  toArg: string,
  amountArg: string,
  tokenAddress?: string,
  opts: { signer?: "session" | "local" } = {},
) {
  if (tokenAddress) {
    validateAddress(tokenAddress);
  }

  const { client, network, address: from, paymaster } = buildWalletClient(program, { signer: opts.signer });

  const rpcClient = clientFromFlags(program);
  const to = await resolveAddress(toArg, rpcClient) as EvmAddress;

  let decimals: number;
  let symbol: string;

  if (tokenAddress) {
    const meta = await fetchTokenDecimals(program, tokenAddress);
    decimals = meta.decimals;
    symbol = meta.symbol;
  } else {
    decimals = NATIVE_EVM_DECIMALS;
    symbol = nativeTokenSymbol(network);
  }

  const wei = parseAmount(amountArg, decimals);

  const calls = tokenAddress
    ? [{
        to: tokenAddress as EvmAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, wei],
        }),
      }]
    : [{ to, value: wei }];

  const { id } = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    () => client.sendCalls({
      calls,
      capabilities: paymaster ? { paymaster } : undefined,
    }),
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Transaction confirmed",
    () => client.waitForCallsStatus({ id }),
  );

  const txHash = status.receipts?.[0]?.transactionHash;
  const confirmed = status.status === "success";

  if (isJSONMode()) {
    printJSON({
      from,
      to,
      amount: amountArg,
      token: tokenAddress ?? symbol,
      network,
      sponsored: !!paymaster,
      txHash: txHash ?? null,
      callId: id,
      status: status.status,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", from],
      ["To", to],
      ["Amount", green(`${amountArg} ${symbol}`)],
      ["Network", network],
      ["Call ID", id],
    ];

    if (paymaster) {
      pairs.push(["Gas", green("Sponsored")]);
    }

    if (txHash) {
      pairs.push(["Tx Hash", txHash]);
    }

    pairs.push(["Status", confirmed ? green("Confirmed") : `Pending (${status.status})`]);

    printKeyValueBox(pairs);
  }
}
