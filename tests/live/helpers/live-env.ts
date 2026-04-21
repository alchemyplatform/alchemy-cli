import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import { formatEther, formatUnits, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Client } from "../../../src/lib/client.js";
import { parseSolanaKeyBytes, SOL_DECIMALS } from "../../../src/lib/solana-tx.js";

const DEFAULT_EVM_NETWORK = "eth-sepolia";
const DEFAULT_SOLANA_NETWORK = "solana-devnet";
const DEFAULT_MIN_EVM_WEI = 10_000_000_000_000_000n;
const DEFAULT_MIN_SOL_LAMPORTS = 20_000_000n;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required live test environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function parseBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`${name} must be a base-10 integer string.`);
  }
}

function normalizeEvmPrivateKey(privateKey: string): `0x${string}` {
  const trimmed = privateKey.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

async function deriveSolanaAddress(secret: string): Promise<string> {
  const keyBytes = parseSolanaKeyBytes(secret);
  if (keyBytes.length === 64) {
    const signer = await createKeyPairSignerFromBytes(keyBytes, true);
    return signer.address;
  }
  if (keyBytes.length === 32) {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(keyBytes, true);
    return signer.address;
  }
  throw new Error("Invalid Solana live test key: expected 64-byte secret key or 32-byte private key.");
}

function validateEvmAddress(name: string, address: string): string {
  if (!isAddress(address)) {
    throw new Error(`${name} must be a valid 0x-prefixed EVM address.`);
  }
  return address;
}

export interface LiveConfig {
  apiKey: string;
  evmNetwork: string;
  solanaNetwork: string;
  evmGasPolicyId?: string;
  solanaGasPolicyId?: string;
  evmPrivateKey: string;
  solanaPrivateKey: string;
  evmAddress: string;
  solanaAddress: string;
  evmRecipient: string;
  solanaRecipient: string;
  evmContractAddress: string;
  minEvmWei: bigint;
  minSolLamports: bigint;
  evmSendAmount: string;
  evmDepositAmount: string;
  solanaSendAmount: string;
}

export interface LiveBalanceStatus {
  evmWei?: bigint;
  solLamports?: bigint;
  evmReady: boolean;
  solanaReady: boolean;
}

export async function loadLiveConfig(): Promise<LiveConfig> {
  const evmPrivateKey = requiredEnv("ALCHEMY_LIVE_EVM_PRIVATE_KEY");
  const solanaPrivateKey = requiredEnv("ALCHEMY_LIVE_SOLANA_PRIVATE_KEY");
  const evmAddress = privateKeyToAccount(normalizeEvmPrivateKey(evmPrivateKey)).address;
  const solanaAddress = await deriveSolanaAddress(solanaPrivateKey);

  return {
    apiKey: requiredEnv("ALCHEMY_LIVE_API_KEY"),
    evmNetwork: optionalEnv("ALCHEMY_LIVE_NETWORK", DEFAULT_EVM_NETWORK),
    solanaNetwork: optionalEnv("ALCHEMY_LIVE_SOLANA_NETWORK", DEFAULT_SOLANA_NETWORK),
    evmGasPolicyId: process.env.ALCHEMY_LIVE_EVM_GAS_POLICY_ID?.trim() || undefined,
    solanaGasPolicyId: process.env.ALCHEMY_LIVE_SOLANA_GAS_POLICY_ID?.trim() || undefined,
    evmPrivateKey,
    solanaPrivateKey,
    evmAddress,
    solanaAddress,
    evmRecipient: validateEvmAddress(
      "ALCHEMY_LIVE_EVM_RECIPIENT",
      requiredEnv("ALCHEMY_LIVE_EVM_RECIPIENT"),
    ),
    solanaRecipient: requiredEnv("ALCHEMY_LIVE_SOLANA_RECIPIENT"),
    evmContractAddress: validateEvmAddress(
      "ALCHEMY_LIVE_EVM_CONTRACT_ADDRESS",
      requiredEnv("ALCHEMY_LIVE_EVM_CONTRACT_ADDRESS"),
    ),
    minEvmWei: parseBigIntEnv("ALCHEMY_LIVE_MIN_EVM_WEI", DEFAULT_MIN_EVM_WEI),
    minSolLamports: parseBigIntEnv("ALCHEMY_LIVE_MIN_SOL_LAMPORTS", DEFAULT_MIN_SOL_LAMPORTS),
    evmSendAmount: optionalEnv("ALCHEMY_LIVE_EVM_SEND_AMOUNT", "0.000001"),
    evmDepositAmount: optionalEnv("ALCHEMY_LIVE_EVM_DEPOSIT_AMOUNT", "0.000001"),
    solanaSendAmount: optionalEnv("ALCHEMY_LIVE_SOLANA_SEND_AMOUNT", "0.001"),
  };
}

export function createEvmClient(config: LiveConfig): Client {
  return new Client(config.apiKey, config.evmNetwork);
}

export function createSolanaClient(config: LiveConfig): Client {
  return new Client(config.apiKey, config.solanaNetwork);
}

export async function fetchEvmBalance(config: LiveConfig): Promise<bigint> {
  const client = createEvmClient(config);
  const result = await client.call("eth_getBalance", [config.evmAddress, "latest"]) as string;
  return BigInt(result);
}

export async function fetchSolanaBalance(config: LiveConfig): Promise<bigint> {
  const client = createSolanaClient(config);
  const result = await client.call("getBalance", [config.solanaAddress, { commitment: "confirmed" }]) as {
    value: number;
  };
  return BigInt(result.value);
}

export async function getLiveBalanceStatus(
  config: LiveConfig,
  scope: "evm" | "solana" | "all" = "all",
): Promise<LiveBalanceStatus> {
  const needsEvm = scope === "evm" || scope === "all";
  const needsSolana = scope === "solana" || scope === "all";

  const [evmWei, solLamports] = await Promise.all([
    needsEvm ? fetchEvmBalance(config) : Promise.resolve(undefined),
    needsSolana ? fetchSolanaBalance(config) : Promise.resolve(undefined),
  ]);

  return {
    evmWei,
    solLamports,
    evmReady: evmWei !== undefined ? evmWei >= config.minEvmWei : true,
    solanaReady: solLamports !== undefined ? solLamports >= config.minSolLamports : true,
  };
}

export function formatEvmBalance(wei: bigint): string {
  return `${formatEther(wei)} ETH`;
}

export function formatSolBalance(lamports: bigint): string {
  return `${formatUnits(lamports, SOL_DECIMALS)} SOL`;
}
