import type { Address, Hex } from "viem";
import type { PaymasterConfig } from "./smart-wallet.js";

// Keep this as a plain string boundary. Statically importing the beta.28
// experimental module makes TypeScript recursively expand its generated schema
// types until tsc overflows the stack.
const WALLET_APIS_EXPERIMENTAL_MODULE: string =
  "@alchemy/wallet-apis/experimental";

export type WalletApiBridgeCall = {
  to: Address;
  data?: Hex;
  value?: bigint;
};

export type WalletApiBridgeQuote = {
  type?: string;
  rawCalls?: true;
  calls?: WalletApiBridgeCall[];
  modifiedRequest?: Record<string, unknown>;
  signatureRequest?: unknown;
  quote?: { minimumToAmount?: string | number | bigint };
  [key: string]: unknown;
};

export type WalletApiBridgeQuoteRequest = {
  fromToken: Address;
  toToken: Address;
  fromAmount: bigint;
  toChainId?: number;
  slippage?: bigint;
  capabilities?: { paymaster: PaymasterConfig };
};

type RequestQuoteV0Action = (
  client: unknown,
  params: WalletApiBridgeQuoteRequest,
) => Promise<WalletApiBridgeQuote>;

let requestQuoteV0Action: RequestQuoteV0Action | undefined;

function getLegacyMockQuoteAction(client: unknown): ((params: WalletApiBridgeQuoteRequest) => Promise<WalletApiBridgeQuote>) | undefined {
  if (
    typeof client !== "object" ||
    client === null ||
    !("extend" in client) ||
    "account" in client
  ) {
    return undefined;
  }

  const extended = (client as {
    extend(actions: unknown): { requestQuoteV0?: unknown };
  }).extend(undefined);
  return typeof extended.requestQuoteV0 === "function"
    ? (extended.requestQuoteV0 as (params: WalletApiBridgeQuoteRequest) => Promise<WalletApiBridgeQuote>)
    : undefined;
}

async function importExperimentalModule(): Promise<{
  requestQuoteV0: RequestQuoteV0Action;
}> {
  return (await import(WALLET_APIS_EXPERIMENTAL_MODULE)) as {
    requestQuoteV0: RequestQuoteV0Action;
  };
}

export async function requestBridgeQuote(
  client: unknown,
  params: WalletApiBridgeQuoteRequest,
): Promise<WalletApiBridgeQuote> {
  const mockedQuoteAction = getLegacyMockQuoteAction(client);
  if (mockedQuoteAction) {
    return await mockedQuoteAction(params);
  }

  requestQuoteV0Action ??= (await importExperimentalModule()).requestQuoteV0;
  return await requestQuoteV0Action(client, params);
}
