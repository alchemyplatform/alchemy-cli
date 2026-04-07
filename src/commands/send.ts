import { Command } from "commander";
import { encodeFunctionData, type Address, erc20Abi } from "viem";
import { buildWalletClient } from "../lib/smart-wallet.js";
import { clientFromFlags } from "../lib/resolve.js";
import { resolveAddress, validateAddress } from "../lib/validators.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError, errInvalidArgs } from "../lib/errors.js";
import { withSpinner, printKeyValueBox, green } from "../lib/ui.js";

const NATIVE_DECIMALS = 18;

export function parseAmount(amount: string, decimals: number): bigint {
  if (!amount || amount.trim() === "") {
    throw errInvalidArgs("Amount is required.");
  }
  const trimmed = amount.trim();
  if (trimmed.startsWith("-")) {
    throw errInvalidArgs("Amount must be a positive number.");
  }

  const parts = trimmed.split(".");
  if (parts.length > 2) {
    throw errInvalidArgs(`Invalid amount "${trimmed}".`);
  }

  const whole = parts[0] || "0";
  let fractional = parts[1] || "";

  if (fractional.length > decimals) {
    throw errInvalidArgs(
      `Too many decimal places for this token (max ${decimals}).`,
    );
  }

  fractional = fractional.padEnd(decimals, "0");

  const raw = whole + fractional;
  try {
    const value = BigInt(raw);
    if (value === 0n) {
      throw errInvalidArgs("Amount must be greater than zero.");
    }
    return value;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Amount must be")) throw err;
    throw errInvalidArgs(`Invalid amount "${trimmed}".`);
  }
}

async function fetchTokenDecimals(
  program: Command,
  tokenAddress: string,
): Promise<{ decimals: number; symbol: string }> {
  const client = clientFromFlags(program);
  const result = await client.call("alchemy_getTokenMetadata", [tokenAddress]) as {
    decimals: number | null;
    symbol: string | null;
  };

  if (result.decimals == null) {
    throw errInvalidArgs(`Could not fetch decimals for token ${tokenAddress}. Is it a valid ERC-20 contract on this network?`);
  }

  return {
    decimals: result.decimals,
    symbol: result.symbol ?? tokenAddress,
  };
}

export function registerSend(program: Command) {
  program
    .command("send")
    .description("Send native tokens or ERC-20 tokens to an address")
    .argument("<to>", "Recipient address (0x...) or ENS name")
    .argument("<amount>", "Amount to send (human-readable, e.g. 1.5)")
    .option("--token <address>", "ERC-20 token contract address (omit for native token)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy send 0xAbC...123 1.5                          Send 1.5 ETH
  alchemy send vitalik.eth 0.1 -n base-mainnet          Send 0.1 ETH on Base
  alchemy send 0xAbC...123 100 --token 0xA0b8...USDC    Send 100 USDC
  alchemy send 0xAbC...123 1 --gas-sponsored --gas-policy-id <id>`,
    )
    .action(async (toArg: string, amountArg: string, opts: { token?: string }) => {
      try {
        await performSend(program, toArg, amountArg, opts.token);
      } catch (err) {
        exitWithError(err);
      }
    });
}

async function performSend(
  program: Command,
  toArg: string,
  amountArg: string,
  tokenAddress?: string,
) {
  // Validate token address early if provided
  if (tokenAddress) {
    validateAddress(tokenAddress);
  }

  // Build smart wallet client
  const { client, network, address: from, paymaster } = buildWalletClient(program);

  // Resolve recipient (ENS support)
  const rpcClient = clientFromFlags(program);
  const to = await resolveAddress(toArg, rpcClient) as Address;

  // Determine token info and parse amount
  let decimals: number;
  let symbol: string;

  if (tokenAddress) {
    const meta = await fetchTokenDecimals(program, tokenAddress);
    decimals = meta.decimals;
    symbol = meta.symbol;
  } else {
    decimals = NATIVE_DECIMALS;
    symbol = nativeTokenSymbol(network);
  }

  const wei = parseAmount(amountArg, decimals);

  // Build the call
  const calls = tokenAddress
    ? [{
        to: tokenAddress as Address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, wei],
        }),
      }]
    : [{ to, value: wei }];

  // Send and wait
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
