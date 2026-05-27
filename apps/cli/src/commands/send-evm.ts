import { Command } from "commander";
import { encodeFunctionData, type Address as EvmAddress, erc20Abi } from "viem";
import { buildWalletClient, ensureGasPolicyResolved } from "../lib/smart-wallet.js";
import { apiKeyClientFromFlags, resolveRequiredNetwork } from "../lib/resolve.js";
import { resolveAddress, validateAddress } from "../lib/validators.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { withSpinner, printKeyValue, green, successBadge } from "../lib/ui.js";
import { addSignerOption, parseSignerOpt } from "../lib/params.js";
import { fetchTokenDecimals, parseAmount } from "../lib/token-amounts.js";

const NATIVE_EVM_DECIMALS = 18;

interface EvmCallPreview {
  to: EvmAddress;
  data?: string;
  value?: bigint;
}

function formatCallPreview(call: EvmCallPreview): Record<string, string> {
  return {
    to: call.to,
    ...(call.value !== undefined ? { value: call.value.toString() } : {}),
    ...(call.data ? { data: call.data } : {}),
  };
}

export function registerEvmSend(program: Command) {
  const sendCmd = program
    .command("send")
    .description("Send native tokens or ERC-20 tokens to an address")
    .argument("<to>", "Recipient address (0x... or ENS name)")
    .argument("<amount>", "Amount to send (human-readable, e.g. 1.5)")
    .option("--token <address>", "ERC-20 token contract address (omit for native token)")
    .option("--dry-run", "Preview transaction without signing or sending");
  addSignerOption(sendCmd);
  sendCmd
    .option("--gas-sponsored", "Enable gas sponsorship (env: ALCHEMY_EVM_GAS_SPONSORED)")
    .option("--gas-policy-id <id>", "Gas policy ID for sponsorship (env: ALCHEMY_EVM_GAS_POLICY_ID)")
    .addHelpText(
      "after",
      `
Omit --token to send the native token for the selected network.
Network is required via -n/--network.

Examples:
  alchemy evm send 0xAbC...123 1.5 -n eth-mainnet                         Send 1.5 ETH
  alchemy evm send vitalik.eth 0.1 -n base-mainnet                         Send 0.1 ETH on Base
  alchemy evm send 0xAbC...123 1 -n monad-testnet                          Send 1 MON
  alchemy evm send 0xAbC...123 100 --token 0xA0b8...USDC -n eth-mainnet     Send 100 USDC
  alchemy evm send 0xAbC...123 1.5 --dry-run -n eth-mainnet                Preview without signing or sending
  alchemy evm send 0xAbC...123 1 -n base-mainnet --gas-sponsored --gas-policy-id <id>
  alchemy evm send 0xAbC...123 1.5 --signer local -n eth-mainnet           Force the local wallet`,
    )
    .action(async (toArg: string, amountArg: string, _opts: unknown, cmd: Command) => {
      try {
        const opts = cmd.opts<{ token?: string; signer?: string; dryRun?: boolean }>();
        await performEvmSend(cmd, toArg, amountArg, opts.token, {
          signer: parseSignerOpt(opts.signer),
          dryRun: opts.dryRun,
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
  opts: { signer?: "session" | "local"; dryRun?: boolean } = {},
) {
  if (tokenAddress) {
    validateAddress(tokenAddress);
  }

  const network = resolveRequiredNetwork(program);
  const gasPolicyIdOverride = await ensureGasPolicyResolved(program, {
    networkOverride: network,
  });
  const { client, address: from, paymaster } = buildWalletClient(program, {
    signer: opts.signer,
    networkOverride: network,
    ...(gasPolicyIdOverride && { gasPolicyIdOverride }),
  });

  const rpcClient = apiKeyClientFromFlags(program, {
    forceNetwork: network,
  });
  const to = await resolveAddress(toArg, rpcClient) as EvmAddress;

  let decimals: number;
  let symbol: string;

  if (tokenAddress) {
    const meta = await fetchTokenDecimals(program, tokenAddress, {
      network,
    });
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

  if (opts.dryRun) {
    const previewCalls = calls.map(formatCallPreview);
    if (isJSONMode()) {
      printJSON({
        dryRun: true,
        action: "evm-send",
        from,
        to,
        amount: amountArg,
        token: tokenAddress ?? symbol,
        tokenAddress: tokenAddress ?? null,
        network,
        sponsored: !!paymaster,
        calls: previewCalls,
      });
    } else {
      const pairs: [string, string][] = [
        ["Dry Run", "yes"],
        ["From", from],
        ["To", to],
        ["Amount", green(`${amountArg} ${symbol}`)],
        ["Network", network],
        ["Calls", String(previewCalls.length)],
      ];
      if (paymaster) {
        pairs.push(["Gas", green("Sponsored")]);
      }
      printKeyValue(pairs);
    }
    return;
  }

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

    pairs.push(["Status", confirmed ? `${successBadge()} ${green("Confirmed")}` : `Pending (${status.status})`]);

    printKeyValue(pairs);
  }
}
