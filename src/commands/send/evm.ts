import { Command } from "commander";
import { encodeFunctionData, type Address as EvmAddress, erc20Abi } from "viem";
import { buildWalletClient } from "../../lib/smart-wallet.js";
import { clientFromFlags } from "../../lib/resolve.js";
import { resolveAddress, validateAddress } from "../../lib/validators.js";
import { nativeTokenSymbol } from "../../lib/networks.js";
import { isJSONMode, printJSON } from "../../lib/output.js";
import { withSpinner, printKeyValueBox, green } from "../../lib/ui.js";
import { fetchTokenDecimals, parseAmount } from "./shared.js";

const NATIVE_EVM_DECIMALS = 18;

export async function performEvmSend(
  program: Command,
  toArg: string,
  amountArg: string,
  tokenAddress?: string,
) {
  if (tokenAddress) {
    validateAddress(tokenAddress);
  }

  const { client, network, address: from, paymaster } = buildWalletClient(program);

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
