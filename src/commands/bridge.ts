import { Command } from "commander";
import type { Address } from "viem";
import { buildWalletClient } from "../lib/smart-wallet.js";
import type { PaymasterConfig } from "../lib/smart-wallet.js";
import {
  requestBridgeQuote,
  type WalletApiBridgeCall,
  type WalletApiBridgeQuote,
  type WalletApiBridgeQuoteRequest,
} from "../lib/wallet-api-experimental.js";
import { validateAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { CLIError, exitWithError, errInvalidArgs } from "../lib/errors.js";
import { addSignerOption, parseSignerOpt } from "../lib/params.js";
import { withSpinner, printKeyValue, green, successBadge } from "../lib/ui.js";
import { nativeTokenSymbol } from "../lib/networks.js";
import { networkToChain } from "../lib/chains.js";
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
  signer?: string;
}

interface BridgeWalletClient {
  prepareCalls(params: Record<string, unknown>): Promise<WalletApiBridgeQuote>;
  sendCalls(params: {
    calls: WalletApiBridgeCall[];
    capabilities?: { paymaster: PaymasterConfig };
  }): Promise<{ id: string }>;
  sendPreparedCalls(params: unknown): Promise<{ id: string }>;
  signPreparedCalls(params: WalletApiBridgeQuote): Promise<unknown>;
  signSignatureRequest(params: unknown): Promise<unknown>;
  waitForCallsStatus(params: { id: string }): Promise<{
    status?: string;
    receipts?: Array<{ transactionHash?: string }>;
  }>;
}

interface BridgeWalletContext {
  client: BridgeWalletClient;
  network: string;
  address: Address;
  paymaster: PaymasterConfig | undefined;
}

function createBridgeQuoteRequest(
  fromToken: string,
  toToken: string,
  fromAmount: bigint,
  toChainId: number,
  slippagePercent: number | undefined,
  paymaster?: PaymasterConfig,
): WalletApiBridgeQuoteRequest {
  const request = {
    fromToken: fromToken as Address,
    toToken: toToken as Address,
    fromAmount,
    toChainId,
    ...(slippagePercent !== undefined
      ? { slippage: slippagePercentToBasisPoints(slippagePercent) }
      : {}),
    ...(paymaster ? { capabilities: { paymaster } } : {}),
  } satisfies WalletApiBridgeQuoteRequest;

  return request;
}

function unsupportedBridgeNetwork(received: string): CLIError {
  const solanaNote = received.includes("solana")
    ? " Solana bridge support is coming soon."
    : "";
  return errInvalidArgs(`Bridge supports EVM mainnets only.${solanaNote} Received ${received}.`);
}

function isBridgeMainnet(network: string): boolean {
  return network.endsWith("-mainnet");
}

function validateBridgeNetworks(fromNetwork: string, toNetwork: string): void {
  const route = `${fromNetwork} -> ${toNetwork}`;
  if (!isBridgeMainnet(fromNetwork) || !isBridgeMainnet(toNetwork)) {
    throw unsupportedBridgeNetwork(route);
  }

  if (fromNetwork === toNetwork) {
    throw errInvalidArgs(
      `Source and destination networks must differ for bridge. Use 'alchemy evm swap' for same-chain token exchanges on ${fromNetwork}.`,
    );
  }
}

function bridgeDestinationChainId(toNetwork: string): number {
  try {
    return networkToChain(toNetwork).id;
  } catch (err) {
    if (err instanceof CLIError && err.code === "INVALID_ARGS") {
      throw unsupportedBridgeNetwork(toNetwork);
    }
    throw err;
  }
}

async function prepareQuoteForExecution(
  client: BridgeWalletClient,
  quote: WalletApiBridgeQuote,
): Promise<WalletApiBridgeQuote> {
  if (!("type" in quote) || quote.type !== "paymaster-permit" || !("modifiedRequest" in quote) || !("signatureRequest" in quote)) {
    return quote;
  }

  const permitSignature = await withSpinner(
    "Signing permit…",
    "Permit signed",
    () => client.signSignatureRequest(quote.signatureRequest),
  );

  const preparedQuote = await withSpinner(
    "Preparing bridge…",
    "Bridge prepared",
    () => client.prepareCalls({
      ...quote.modifiedRequest,
      paymasterPermitSignature: permitSignature,
    }),
  );

  if (
    typeof preparedQuote === "object" &&
    preparedQuote !== null &&
    "type" in preparedQuote &&
    preparedQuote.type === "paymaster-permit"
  ) {
    throw errInvalidArgs("Bridge quote still requires a paymaster permit after signing. The quote response format may be unsupported.");
  }

  return preparedQuote;
}

function extractQuoteData(quote: WalletApiBridgeQuote): { type: string; minimumOutput?: bigint } {
  const type = typeof quote.type === "string" ? quote.type : "unknown";

  if (quote.quote?.minimumToAmount !== undefined) {
    return { type, minimumOutput: BigInt(quote.quote.minimumToAmount) };
  }

  return { type };
}

function isRawCallsQuote(quote: WalletApiBridgeQuote): quote is WalletApiBridgeQuote & {
  rawCalls: true;
  calls: WalletApiBridgeCall[];
} {
  return (
    quote.rawCalls === true &&
    Array.isArray(quote.calls)
  );
}

function buildBridgeWalletClient(
  program: Command,
  signer: "session" | "local" | undefined,
): BridgeWalletContext {
  return buildWalletClient(program, { signer }) as unknown as BridgeWalletContext;
}

export function registerBridge(program: Command) {
  const cmd = program
    .command("bridge")
    .description("Bridge tokens from the source -n/--network to a destination --to-network");

  // ── bridge quote ──────────────────────────────────────────────────

  const quoteCmd = cmd
    .command("quote")
    .description("Get a bridge quote without executing")
    .requiredOption("--from <token_address>", `Source token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--to <token_address>", `Destination token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--amount <number>", "Amount to bridge in decimal token units (for example, 1.5)")
    .requiredOption("--to-network <network>", "Destination network (e.g. base-mainnet)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)");
  addSignerOption(quoteCmd);
  quoteCmd
    .addHelpText(
      "after",
      `
Source network comes from the global -n/--network flag. Use --to-network for the destination chain.
For same-chain token exchanges, use 'alchemy evm swap'.

Examples:
  alchemy xchain bridge quote --from ${NATIVE_TOKEN_ADDRESS} --to ${NATIVE_TOKEN_ADDRESS} --amount 0.1 --to-network base-mainnet -n eth-mainnet
  alchemy xchain bridge quote --from <eth_usdc_address> --to <arb_usdc_address> --amount 100 --to-network arb-mainnet -n eth-mainnet`,
    )
    .action(async (opts: BridgeOpts) => {
      try {
        await performBridgeQuote(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── bridge execute ────────────────────────────────────────────────

  const executeCmd = cmd
    .command("execute")
    .description("Execute a cross-chain bridge")
    .requiredOption("--from <token_address>", `Source token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--to <token_address>", `Destination token address (use ${NATIVE_TOKEN_ADDRESS} for the native token)`)
    .requiredOption("--amount <number>", "Amount to bridge in decimal token units (for example, 1.5)")
    .requiredOption("--to-network <network>", "Destination network (e.g. base-mainnet)")
    .option("--slippage <percent>", "Max slippage percentage (omit to use the API default)");
  addSignerOption(executeCmd);
  executeCmd
    .option("--gas-sponsored", "Enable gas sponsorship (env: ALCHEMY_EVM_GAS_SPONSORED)")
    .option("--gas-policy-id <id>", "Gas policy ID for sponsorship (env: ALCHEMY_EVM_GAS_POLICY_ID)")
    .addHelpText(
      "after",
      `
Source network comes from the global -n/--network flag. Use --to-network for the destination chain.
For same-chain token exchanges, use 'alchemy evm swap'.

Examples:
  alchemy xchain bridge execute --from ${NATIVE_TOKEN_ADDRESS} --to ${NATIVE_TOKEN_ADDRESS} --amount 0.1 --to-network base-mainnet -n eth-mainnet
  alchemy xchain bridge execute --from <eth_usdc_address> --to <arb_usdc_address> --amount 100 --to-network arb-mainnet --gas-sponsored --gas-policy-id <id> -n eth-mainnet`,
    )
    .action(async (_opts: unknown, cmd: Command) => {
      try {
        const opts = cmd.opts<BridgeOpts>();
        await performBridgeExecute(cmd, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Quote implementation ────────────────────────────────────────────

async function performBridgeQuote(program: Command, opts: BridgeOpts) {
  validateAddress(opts.from);

  const toChainId = bridgeDestinationChainId(opts.toNetwork);
  validateAddress(opts.to);

  const signer = parseSignerOpt(opts.signer);
  const { client, network, paymaster } = buildBridgeWalletClient(program, signer);
  validateBridgeNetworks(network, opts.toNetwork);

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  const quote = await withSpinner(
    "Fetching bridge quote…",
    "Quote received",
    () => requestBridgeQuote(client, createBridgeQuoteRequest(opts.from, opts.to, rawAmount, toChainId, slippage, paymaster)),
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

    printKeyValue(pairs);
  }
}

// ── Execute implementation ──────────────────────────────────────────

async function performBridgeExecute(program: Command, opts: BridgeOpts) {
  validateAddress(opts.from);

  const toChainId = bridgeDestinationChainId(opts.toNetwork);
  validateAddress(opts.to);

  const signer = parseSignerOpt(opts.signer);
  const { client, network, address: from, paymaster } = buildBridgeWalletClient(program, signer);
  validateBridgeNetworks(network, opts.toNetwork);
  const bridgeClient = client;

  const fromInfo = await resolveTokenInfo(network, program, opts.from);
  const rawAmount = parseAmount(opts.amount, fromInfo.decimals);

  const slippage = opts.slippage ? parseFloat(opts.slippage) : undefined;
  if (slippage !== undefined && (isNaN(slippage) || slippage < 0 || slippage > 100)) {
    throw errInvalidArgs("Slippage must be a number between 0 and 100.");
  }

  const quote = await withSpinner(
    "Fetching bridge quote…",
    "Quote received",
    () => requestBridgeQuote(client, createBridgeQuoteRequest(opts.from, opts.to, rawAmount, toChainId, slippage, paymaster)),
  );

  const preparedQuote = await prepareQuoteForExecution(bridgeClient, quote);

  const { id } = await withSpinner(
    "Sending bridge transaction…",
    "Transaction submitted",
    async () => {
      if (isRawCallsQuote(preparedQuote)) {
        return bridgeClient.sendCalls({
          calls: preparedQuote.calls,
          capabilities: paymaster ? { paymaster } : undefined,
        });
      }

      const signedQuote = await bridgeClient.signPreparedCalls(preparedQuote);
      return bridgeClient.sendPreparedCalls(signedQuote);
    },
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Bridge confirmed",
    () => bridgeClient.waitForCallsStatus({ id }),
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

    pairs.push(["Status", confirmed ? `${successBadge()} ${green("Confirmed")}` : `Pending (${status.status})`]);

    printKeyValue(pairs);
  }
}
