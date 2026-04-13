import { Command } from "commander";
import type { Address } from "viem";
import {
  swapActions,
  type RequestQuoteV0Params,
  type RequestQuoteV0Result,
} from "@alchemy/wallet-apis/experimental";
import { buildWalletClient } from "../lib/smart-wallet.js";
import type { PaymasterConfig } from "../lib/smart-wallet.js";
import { validateAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { CLIError, exitWithError, errInvalidArgs } from "../lib/errors.js";
import { withSpinner, printKeyValueBox, green } from "../lib/ui.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { networkToChain } from "../lib/chains.js";
import { parseAmount, fetchTokenDecimals, formatTokenAmount } from "./send/shared.js";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
const NATIVE_DECIMALS = 18;

function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

function slippagePercentToBasisPoints(percent: number): bigint {
  return BigInt(Math.round(percent * 100));
}

async function resolveTokenInfo(
  network: string,
  program: Command,
  tokenAddress: string,
): Promise<{ decimals: number; symbol: string }> {
  if (isNativeToken(tokenAddress)) {
    return { decimals: NATIVE_DECIMALS, symbol: nativeTokenSymbol(network) };
  }

  try {
    return await fetchTokenDecimals(program, tokenAddress, { network });
  } catch (err) {
    if (err instanceof CLIError && err.code === "INVALID_ARGS") {
      throw err;
    }
    const detail = err instanceof Error && err.message ? ` ${err.message}` : "";
    throw errInvalidArgs(`Failed to resolve token info for ${tokenAddress}.${detail}`);
  }
}

interface BridgeOpts {
  from: string;
  to: string;
  amount: string;
  toNetwork: string;
  slippage?: string;
}

type WalletClient = ReturnType<typeof buildWalletClient>["client"];
type PaymasterPermitQuote = Extract<RequestQuoteV0Result, { type: "paymaster-permit" }>;
type RawCallsQuote = Extract<RequestQuoteV0Result, { rawCalls: true }>;
type ExecutablePreparedQuote = Parameters<WalletClient["signPreparedCalls"]>[0];
type PreparedCallsRequest = Parameters<WalletClient["prepareCalls"]>[0];
type SignatureRequest = Parameters<WalletClient["signSignatureRequest"]>[0];
type ExecutableQuote = ExecutablePreparedQuote | RawCallsQuote;

function createBridgeQuoteRequest(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  toChainId: number,
  slippagePercent: number | undefined,
  paymaster?: PaymasterConfig,
): RequestQuoteV0Params {
  const request = {
    fromToken: fromToken as Address,
    toToken: toToken as Address,
    fromAmount,
    toChainId,
    ...(slippagePercent !== undefined
      ? { slippage: slippagePercentToBasisPoints(slippagePercent) }
      : {}),
    ...(paymaster ? { capabilities: { paymaster } } : {}),
  } satisfies RequestQuoteV0Params;

  return request;
}

function validateBridgeNetworks(fromNetwork: string, toNetwork: string): void {
  if (fromNetwork === toNetwork) {
    throw errInvalidArgs(
      `Source and destination networks must differ for bridge. Use 'alchemy swap' for same-chain token exchanges on ${fromNetwork}.`,
    );
  }
}

async function prepareQuoteForExecution(
  client: WalletClient,
  quote: RequestQuoteV0Result,
): Promise<ExecutableQuote> {
  if (!("type" in quote) || quote.type !== "paymaster-permit" || !("modifiedRequest" in quote) || !("signatureRequest" in quote)) {
    return quote as ExecutableQuote;
  }

  const permitQuote = quote as PaymasterPermitQuote & {
    modifiedRequest: PreparedCallsRequest;
    signatureRequest: SignatureRequest;
  };
  const permitSignature = await withSpinner(
    "Signing permit…",
    "Permit signed",
    () => client.signSignatureRequest(permitQuote.signatureRequest),
  );

  const preparedQuote = await withSpinner(
    "Preparing bridge…",
    "Bridge prepared",
    () => client.prepareCalls({
      ...permitQuote.modifiedRequest,
      paymasterPermitSignature: permitSignature,
    }),
  );

  if ("type" in preparedQuote && preparedQuote.type === "paymaster-permit") {
    throw errInvalidArgs("Bridge quote still requires a paymaster permit after signing. The quote response format may be unsupported.");
  }

  return preparedQuote as ExecutableQuote;
}

function extractQuoteData(quote: RequestQuoteV0Result): { type: string; minimumOutput?: bigint } {
  const type = "type" in quote ? quote.type : "unknown";

  if (quote.quote?.minimumToAmount !== undefined) {
    return { type, minimumOutput: BigInt(quote.quote.minimumToAmount) };
  }

  return { type };
}

export function registerBridge(program: Command) {
  const cmd = program
    .command("bridge")
    .description("Bridge tokens from the source -n/--network to a destination --to-network");

  // ── bridge quote ──────────────────────────────────────────────────

  cmd
    .command("quote")
    .description("Get a bridge quote without executing")
    .requiredOption("--from <token_address>", `Source token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--to <token_address>", `Destination token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--amount <number>", "Amount to bridge in decimal token units (for example, 1.5)")
    .requiredOption("--to-network <network>", "Destination network (e.g. base-mainnet)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)")
    .addHelpText(
      "after",
      `
Source network comes from the global -n/--network flag. Use --to-network for the destination chain.
For same-chain token exchanges, use 'alchemy swap'.

Examples:
  alchemy bridge quote --from ${NATIVE_TOKEN_ADDRESS} --to ${NATIVE_TOKEN_ADDRESS} --amount 0.1 --to-network base-mainnet -n eth-mainnet
  alchemy bridge quote --from <eth_usdc_address> --to <arb_usdc_address> --amount 100 --to-network arb-mainnet -n eth-mainnet`,
    )
    .action(async (opts: BridgeOpts) => {
      try {
        await performBridgeQuote(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── bridge execute ────────────────────────────────────────────────

  cmd
    .command("execute")
    .description("Execute a cross-chain bridge")
    .requiredOption("--from <token_address>", `Source token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--to <token_address>", `Destination token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--amount <number>", "Amount to bridge in decimal token units (for example, 1.5)")
    .requiredOption("--to-network <network>", "Destination network (e.g. base-mainnet)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)")
    .addHelpText(
      "after",
      `
Source network comes from the global -n/--network flag. Use --to-network for the destination chain.
For same-chain token exchanges, use 'alchemy swap'.

Examples:
  alchemy bridge execute --from ${NATIVE_TOKEN_ADDRESS} --to ${NATIVE_TOKEN_ADDRESS} --amount 0.1 --to-network base-mainnet -n eth-mainnet
  alchemy bridge execute --from <eth_usdc_address> --to <arb_usdc_address> --amount 100 --to-network arb-mainnet --gas-sponsored --gas-policy-id <id> -n eth-mainnet`,
    )
    .action(async (opts: BridgeOpts) => {
      try {
        await performBridgeExecute(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Quote implementation ────────────────────────────────────────────

async function performBridgeQuote(program: Command, opts: BridgeOpts) {
  validateAddress(opts.from);
  validateAddress(opts.to);

  const toChainId = networkToChain(opts.toNetwork).id;

  const { client, network, paymaster } = buildWalletClient(program);
  validateBridgeNetworks(network, opts.toNetwork);
  const swapClient = client.extend(swapActions);

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  const quote = await withSpinner(
    "Fetching bridge quote…",
    "Quote received",
    () => swapClient.requestQuoteV0(createBridgeQuoteRequest(opts.from, opts.to, rawAmount, toChainId, slippage, paymaster)),
  );

  const toInfo = await resolveTokenInfo(opts.toNetwork, program, opts.to);
  const quoteData = extractQuoteData(quote);

  if (isJSONMode()) {
    printJSON({
      fromToken: opts.from,
      toToken: opts.to,
      fromAmount: opts.amount,
      fromSymbol: fromInfo.symbol,
      toSymbol: toInfo.symbol,
      minimumOutput: quoteData.minimumOutput ? formatTokenAmount(quoteData.minimumOutput, toInfo.decimals) : null,
      slippage: slippage === undefined ? null : String(slippage),
      fromNetwork: network,
      toNetwork: opts.toNetwork,
      quoteType: quoteData.type,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", green(`${opts.amount} ${fromInfo.symbol}`)],
    ];

    if (quoteData.minimumOutput) {
      pairs.push(["Minimum Receive", green(`${formatTokenAmount(quoteData.minimumOutput, toInfo.decimals)} ${toInfo.symbol}`)]);
    } else {
      pairs.push(["To", toInfo.symbol]);
    }

    pairs.push(
      ["Slippage", slippage === undefined ? "API default" : `${slippage}%`],
      ["From Network", network],
      ["To Network", opts.toNetwork],
    );

    printKeyValueBox(pairs);
  }
}

// ── Execute implementation ──────────────────────────────────────────

async function performBridgeExecute(program: Command, opts: BridgeOpts) {
  validateAddress(opts.from);
  validateAddress(opts.to);

  const toChainId = networkToChain(opts.toNetwork).id;

  const { client, network, address: from, paymaster } = buildWalletClient(program);
  validateBridgeNetworks(network, opts.toNetwork);
  const swapClient = client.extend(swapActions);

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  const quote = await withSpinner(
    "Fetching bridge quote…",
    "Quote received",
    () => swapClient.requestQuoteV0(createBridgeQuoteRequest(opts.from, opts.to, rawAmount, toChainId, slippage, paymaster)),
  );

  const preparedQuote = await prepareQuoteForExecution(client, quote);

  const { id } = await withSpinner(
    "Sending bridge transaction…",
    "Transaction submitted",
    async () => {
      if ("rawCalls" in preparedQuote && preparedQuote.rawCalls === true) {
        const rawCallsQuote = preparedQuote as RawCallsQuote;
        return client.sendCalls({
          calls: rawCallsQuote.calls,
          capabilities: paymaster ? { paymaster } : undefined,
        });
      }

      const executablePreparedQuote = preparedQuote as ExecutablePreparedQuote;
      const signedQuote = await client.signPreparedCalls(executablePreparedQuote);
      return client.sendPreparedCalls(signedQuote);
    },
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Bridge confirmed",
    () => client.waitForCallsStatus({ id }),
  );

  const txHash = status.receipts?.[0]?.transactionHash;
  const confirmed = status.status === "success";
  const toInfo = await resolveTokenInfo(opts.toNetwork, program, opts.to);

  if (isJSONMode()) {
    printJSON({
      from,
      fromToken: opts.from,
      toToken: opts.to,
      fromAmount: opts.amount,
      fromSymbol: fromInfo.symbol,
      toSymbol: toInfo.symbol,
      slippage: slippage === undefined ? null : String(slippage),
      fromNetwork: network,
      toNetwork: opts.toNetwork,
      sponsored: !!paymaster,
      txHash: txHash ?? null,
      callId: id,
      status: status.status,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", `${opts.amount} ${fromInfo.symbol}`],
      ["To", toInfo.symbol],
      ["Slippage", slippage === undefined ? "API default" : `${slippage}%`],
      ["From Network", network],
      ["To Network", opts.toNetwork],
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
