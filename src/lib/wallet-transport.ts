import { alchemyWalletTransport } from "@alchemy/wallet-apis";
import type { AlchemyWalletTransport } from "@alchemy/wallet-apis";
import { parseBaseURLOverride } from "./client-utils.js";

const WALLET_RPC_BASE_URL_ENV = "ALCHEMY_WALLET_RPC_BASE_URL";

export function createAlchemyWalletTransport(apiKey: string): AlchemyWalletTransport {
  const override = parseBaseURLOverride(WALLET_RPC_BASE_URL_ENV);
  return alchemyWalletTransport({
    apiKey,
    ...(override ? { url: override.toString() } : {}),
  });
}
