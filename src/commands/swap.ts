import { Command } from "commander";
import type { Address } from "viem";
import {
  swapActions,
  type RequestQuoteV0Params,
  type RequestQuoteV0Result,
} from "@alchemy/wallet-apis/experimental";
import { buildWalletClient } from "../lib/smart-wallet.js";
import type { PaymasterConfig } from "../lib/smart-wallet.js";
import { buildWalletQuoteClient } from "../lib/wallet-quote-client.js";
import { validateAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { CLIError, exitWithError, errInvalidArgs } from "../lib/errors.js";
import { addSignerOption, parseSignerOpt } from "../lib/params.js";
import { withSpinner, printKeyValue, green, successBadge } from "../lib/ui.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { networkToChain } from "../lib/chains.js";
import { resolveNetwork } from "../lib/resolve.js";
import { normalizeQuoteError } from "../lib/quote-errors.js";
import {
  parseAmount,
  fetchTokenDecimals,
  formatTokenAmount,
} from "../lib/token-amounts.js";

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
    return await fetchTokenDecimals(program, tokenAddress);
  } catch (err) {
    if (err instanceof CLIError && err.code === "INVALID_ARGS") {
      throw err;
    }

    const detail = err instanceof Error && err.message
      ? ` ${err.message}`
      : "";
    throw errInvalidArgs(`Failed to resolve token info for ${tokenAddress}.${detail}`);
  }
}

interface SwapOpts {
  from: string;
  to: string;
  amount: string;
  slippage?: string;
  signer?: string;
  fromAddress?: string;
}

type WalletClient = ReturnType<typeof buildWalletClient>["client"];
type PaymasterPermitQuote = Extract<RequestQuoteV0Result, { type: "paymaster-permit" }>;
type RawCallsQuote = Extract<RequestQuoteV0Result, { rawCalls: true }>;
type ExecutablePreparedQuote = Parameters<WalletClient["signPreparedCalls"]>[0];
type PreparedCallsRequest = Parameters<WalletClient["prepareCalls"]>[0];
type SignatureRequest = Parameters<WalletClient["signSignatureRequest"]>[0];
type ExecutableQuote = ExecutablePreparedQuote | RawCallsQuote;

function createQuoteRequest(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  slippagePercent: number | undefined,
  paymaster?: PaymasterConfig,
  account?: string,
): RequestQuoteV0Params {
  const request = {
    fromToken: fromToken as Address,
    toToken: toToken as Address,
    fromAmount,
    ...(account ? { account: account as Address } : {}),
    ...(slippagePercent !== undefined
      ? { slippage: slippagePercentToBasisPoints(slippagePercent) }
      : {}),
    ...(paymaster ? { capabilities: { paymaster } } : {}),
  } satisfies RequestQuoteV0Params;

  return request;
}

function validateSwapNetwork(network: string): void {
  if (!network.endsWith("-mainnet")) {
    throw errInvalidArgs(
      `Token swaps are only supported on mainnet networks. Received ${network}. Use a network ending in '-mainnet' for swap commands.`,
    );
  }

  try {
    networkToChain(network);
  } catch (err) {
    if (err instanceof CLIError && err.code === "INVALID_ARGS") {
      const solanaNote = network.includes("solana")
        ? " Solana swap support is coming soon."
        : "";
      throw errInvalidArgs(`Token swaps support EVM mainnets only.${solanaNote} Received ${network}.`);
    }
    throw err;
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
    "Preparing swap…",
    "Swap prepared",
    () => client.prepareCalls({
      ...permitQuote.modifiedRequest,
      paymasterPermitSignature: permitSignature,
    }),
  );

  if ("type" in preparedQuote && preparedQuote.type === "paymaster-permit") {
    throw errInvalidArgs("Swap quote still requires a paymaster permit after signing. The quote response format may be unsupported.");
  }

  return preparedQuote as ExecutableQuote;
}

export function registerSwap(program: Command) {
  const cmd = program.command("swap").description("Swap tokens on the same chain");

  // ── swap quote ────────────────────────────────────────────────────

  const quoteCmd = cmd
    .command("quote")
    .description("Get a swap quote without executing")
    .requiredOption("--from <token_address>", "Token address to swap from (use 0xEeee...EEeE for the native token)")
    .requiredOption("--to <token_address>", "Token address to swap to (use 0xEeee...EEeE for the native token)")
    .requiredOption("--amount <number>", "Amount to swap in decimal token units (for example, 1.5)")
    .option("--from-address <address>", "Wallet/account address to quote from without changing signer selection")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)");
  addSignerOption(quoteCmd);
  quoteCmd
    .addHelpText(
      "after",
      `
Examples:
  alchemy evm swap quote --from 0xEeee...EEeE --to 0xA0b8...USDC --amount 1.0 -n eth-mainnet
  alchemy evm swap quote --from 0xUSDC --to 0xDAI --amount 100 --slippage 1.0`,
    )
    .action(async (opts: SwapOpts) => {
      try {
        await performSwapQuote(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── swap execute ──────────────────────────────────────────────────

  const executeCmd = cmd
    .command("execute")
    .description("Execute a token swap")
    .requiredOption("--from <token_address>", "Token address to swap from (use 0xEeee...EEeE for the native token)")
    .requiredOption("--to <token_address>", "Token address to swap to (use 0xEeee...EEeE for the native token)")
    .requiredOption("--amount <number>", "Amount to swap in decimal token units (for example, 1.5)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)");
  addSignerOption(executeCmd);
  executeCmd
    .option("--gas-sponsored", "Enable gas sponsorship (env: ALCHEMY_EVM_GAS_SPONSORED)")
    .option("--gas-policy-id <id>", "Gas policy ID for sponsorship (env: ALCHEMY_EVM_GAS_POLICY_ID)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy evm swap execute --from 0xEeee...EEeE --to 0xA0b8...USDC --amount 1.0 -n eth-mainnet
  alchemy evm swap execute --from 0xUSDC --to 0xDAI --amount 100 --slippage 1.0
  alchemy evm swap execute --from 0xEeee...EEeE --to 0xUSDC --amount 0.1 --gas-sponsored --gas-policy-id <id>`,
    )
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        const opts = cmd.opts<SwapOpts>();
        await performSwapExecute(cmd, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Quote implementation ────────────────────────────────────────────

async function performSwapQuote(program: Command, opts: SwapOpts) {
  validateSwapNetwork(resolveNetwork(program));
  validateAddress(opts.from);
  validateAddress(opts.to);
  if (opts.fromAddress) validateAddress(opts.fromAddress);

  const signer = parseSignerOpt(opts.signer);
  const { client, network, address: fromAddress, paymaster } = opts.fromAddress
    ? buildWalletQuoteClient(program, opts.fromAddress)
    : buildWalletClient(program, { signer });
  const swapClient = client.extend(swapActions);

  // Resolve from-token decimals and parse amount
  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  let quote: RequestQuoteV0Result;
  try {
    quote = await withSpinner(
      "Fetching quote…",
      "Quote received",
      () => swapClient.requestQuoteV0(createQuoteRequest(opts.from, opts.to, rawAmount, slippage, paymaster, fromAddress)),
    );
  } catch (err) {
    throw normalizeQuoteError(err, "swap");
  }

  // Resolve to-token info for display
  const toInfo = await resolveTokenInfo(network, program, opts.to);

  // Extract the minimum receive amount from the quote response.
  const quoteData = extractQuoteData(quote);

  if (isJSONMode()) {
    printJSON({
      fromToken: opts.from,
      toToken: opts.to,
      fromAddress,
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
      ["Wallet", fromAddress],
      ["Slippage", slippage === undefined ? "API default" : `${slippage}%`],
      ["Network", network],
    );

    printKeyValue(pairs);
  }
}

// ── Execute implementation ──────────────────────────────────────────

async function performSwapExecute(program: Command, opts: SwapOpts) {
  validateSwapNetwork(resolveNetwork(program));
  validateAddress(opts.from);
  validateAddress(opts.to);

  const signer = parseSignerOpt(opts.signer);
  const { client, network, address: from, paymaster } = buildWalletClient(program, { signer });
  const swapClient = client.extend(swapActions);

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  // Get quote with prepared calls
  let quote: RequestQuoteV0Result;
  try {
    quote = await withSpinner(
      "Fetching quote…",
      "Quote received",
      () => swapClient.requestQuoteV0(createQuoteRequest(opts.from, opts.to, rawAmount, slippage, paymaster, from)),
    );
  } catch (err) {
    throw normalizeQuoteError(err, "swap");
  }

  const preparedQuote = await prepareQuoteForExecution(client, quote);

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

      const executablePreparedQuote = preparedQuote as ExecutablePreparedQuote;
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

// ── Helpers ─────────────────────────────────────────────────────────

function extractQuoteData(quote: RequestQuoteV0Result): { type: string; minimumOutput?: bigint } {
  const type = "type" in quote ? quote.type : "unknown";

  if (quote.quote?.minimumToAmount !== undefined) {
    return { type, minimumOutput: BigInt(quote.quote.minimumToAmount) };
  }

  return { type };
}
