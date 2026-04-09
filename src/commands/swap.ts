import { Command } from "commander";
import type { Address } from "viem";
import {
  swapActions,
  type RequestQuoteV0Result,
} from "@alchemy/wallet-apis/experimental";
import { buildWalletClient } from "../lib/smart-wallet.js";
import type { PaymasterConfig } from "../lib/smart-wallet.js";
import { validateAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError, errInvalidArgs } from "../lib/errors.js";
import { withSpinner, printKeyValueBox, green } from "../lib/ui.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { parseAmount, fetchTokenDecimals } from "./send/shared.js";

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
  return fetchTokenDecimals(program, tokenAddress);
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const str = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

interface SwapOpts {
  from: string;
  to: string;
  amount: string;
  slippage?: string;
}

type PaymasterPermitQuote = Extract<RequestQuoteV0Result, { type: "paymaster-permit" }>;
type RawCallsQuote = Extract<RequestQuoteV0Result, { rawCalls: true }>;

function createQuoteRequest(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  slippagePercent: number | undefined,
  paymaster?: PaymasterConfig,
) {
  const request = {
    fromToken: fromToken as Address,
    toToken: toToken as Address,
    fromAmount,
    ...(slippagePercent !== undefined
      ? { slippage: slippagePercentToBasisPoints(slippagePercent) }
      : {}),
    ...(paymaster ? { capabilities: { paymaster } } : {}),
  };

  return request as Parameters<ReturnType<ReturnType<typeof buildWalletClient>["client"]["extend"]>["requestQuoteV0"]>[0];
}

export function registerSwap(program: Command) {
  const cmd = program.command("swap").description("Swap tokens on the same chain");

  // ── swap quote ────────────────────────────────────────────────────

  cmd
    .command("quote")
    .description("Get a swap quote without executing")
    .requiredOption("--from <address>", "Token address to swap from (use 0xEeee...EEeE for the native token)")
    .requiredOption("--to <address>", "Token address to swap to")
    .requiredOption("--amount <number>", "Amount to swap (human-readable)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy swap quote --from 0xEeee...EEeE --to 0xA0b8...USDC --amount 1.0 -n eth-mainnet
  alchemy swap quote --from 0xUSDC --to 0xDAI --amount 100 --slippage 1.0`,
    )
    .action(async (opts: SwapOpts) => {
      try {
        await performSwapQuote(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── swap execute ──────────────────────────────────────────────────

  cmd
    .command("execute")
    .description("Execute a token swap")
    .requiredOption("--from <address>", "Token address to swap from (use 0xEeee...EEeE for the native token)")
    .requiredOption("--to <address>", "Token address to swap to")
    .requiredOption("--amount <number>", "Amount to swap (human-readable)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy swap execute --from 0xEeee...EEeE --to 0xA0b8...USDC --amount 1.0 -n eth-mainnet
  alchemy swap execute --from 0xUSDC --to 0xDAI --amount 100 --slippage 1.0
  alchemy swap execute --from 0xEeee...EEeE --to 0xUSDC --amount 0.1 --gas-sponsored --gas-policy-id <id>`,
    )
    .action(async (opts: SwapOpts) => {
      try {
        await performSwapExecute(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Quote implementation ────────────────────────────────────────────

async function performSwapQuote(program: Command, opts: SwapOpts) {
  validateAddress(opts.from);
  validateAddress(opts.to);

  const { client, network, paymaster } = buildWalletClient(program);
  const swapClient = client.extend(swapActions);

  // Resolve from-token decimals and parse amount
  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  const quote = await withSpinner(
    "Fetching quote…",
    "Quote received",
    () => swapClient.requestQuoteV0(createQuoteRequest(opts.from, opts.to, rawAmount, slippage, paymaster)),
  );

  // Resolve to-token info for display
  const toInfo = await resolveTokenInfo(network, program, opts.to);

  // Extract the minimum receive amount from the quote response.
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
      network,
      quoteType: quoteData.type,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", green(`${opts.amount} ${fromInfo.symbol}`)],
    ];

    if (quoteData.minimumOutput) {
      pairs.push(["Minimum Receive", green(`${formatTokenAmount(quoteData.minimumOutput, toInfo.decimals)} ${toInfo.symbol}`)]);
    } else {
      pairs.push(["To", `${toInfo.symbol}`]);
    }

    pairs.push(
      ["Slippage", slippage === undefined ? "API default" : `${slippage}%`],
      ["Network", network],
    );

    printKeyValueBox(pairs);
  }
}

// ── Execute implementation ──────────────────────────────────────────

async function performSwapExecute(program: Command, opts: SwapOpts) {
  validateAddress(opts.from);
  validateAddress(opts.to);

  const { client, network, address: from, paymaster } = buildWalletClient(program);
  const swapClient = client.extend(swapActions);

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  // Get quote with prepared calls
  let quote = await withSpinner(
    "Fetching quote…",
    "Quote received",
    () => swapClient.requestQuoteV0(createQuoteRequest(opts.from, opts.to, rawAmount, slippage, paymaster)),
  );

  // If the quote requires an ERC-7597 permit, sign it and refresh the quote
  // with the attached permit signature before preparing the final calls.
  let preparedQuote:
    | Parameters<typeof client.signPreparedCalls>[0]
    | RawCallsQuote
    | undefined;

  if ("type" in quote && quote.type === "paymaster-permit" && "modifiedRequest" in quote && "signatureRequest" in quote) {
    const permitQuote = quote as PaymasterPermitQuote & {
      modifiedRequest: Parameters<typeof client.prepareCalls>[0];
      signatureRequest: Parameters<typeof client.signSignatureRequest>[0];
    };
    const permitSignature = await withSpinner(
      "Signing permit…",
      "Permit signed",
      () => client.signSignatureRequest(permitQuote.signatureRequest),
    );

    preparedQuote = await withSpinner(
      "Preparing swap…",
      "Swap prepared",
      () => client.prepareCalls({
        ...permitQuote.modifiedRequest,
        paymasterPermitSignature: permitSignature,
      }),
    );
  } else {
    preparedQuote = quote;
  }

  if ("type" in preparedQuote && preparedQuote.type === "paymaster-permit") {
    throw errInvalidArgs("Swap quote still requires a paymaster permit after signing. The quote response format may be unsupported.");
  }

  // Send the quoted swap using the appropriate execution path.
  const { id } = await withSpinner(
    "Sending swap transaction…",
    "Transaction submitted",
    async () => {
      if ("rawCalls" in preparedQuote && preparedQuote.rawCalls === true) {
        const rawCallsQuote = preparedQuote as RawCallsQuote;
        return client.sendCalls({
          calls: rawCallsQuote.calls,
          capabilities: paymaster ? { paymaster } : undefined,
        });
      }

      const executablePreparedQuote = preparedQuote as Parameters<typeof client.signPreparedCalls>[0];
      const signedQuote = await client.signPreparedCalls(executablePreparedQuote);
      return client.sendPreparedCalls(signedQuote);
    },
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Swap confirmed",
    () => client.waitForCallsStatus({ id }),
  );

  const txHash = status.receipts?.[0]?.transactionHash;
  const confirmed = status.status === "success";
  const toInfo = await resolveTokenInfo(network, program, opts.to);

  if (isJSONMode()) {
    printJSON({
      from: from,
      fromToken: opts.from,
      toToken: opts.to,
      fromAmount: opts.amount,
      fromSymbol: fromInfo.symbol,
      toSymbol: toInfo.symbol,
      slippage: slippage === undefined ? null : String(slippage),
      network,
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

// ── Helpers ─────────────────────────────────────────────────────────

function extractQuoteData(quote: any): { type: string; minimumOutput?: bigint } {
  const type = quote.type ?? "unknown";

  if (quote.quote?.minimumToAmount !== undefined) {
    return { type, minimumOutput: BigInt(quote.quote.minimumToAmount) };
  }

  return { type };
}
