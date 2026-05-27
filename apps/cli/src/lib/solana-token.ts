import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from "@solana/kit";
import type { AlchemyClient } from "./client-interface.js";
import { errInvalidArgs } from "./errors.js";

export const SPL_TOKEN_PROGRAM_ADDRESS = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const SPL_TOKEN_2022_PROGRAM_ADDRESS = address("TokenzQdBNbLqP5VEhdkAS6EPYdWnYARjfkM8GoyZ2G");
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");

const SUPPORTED_TOKEN_PROGRAMS = new Set<string>([
  SPL_TOKEN_PROGRAM_ADDRESS,
  SPL_TOKEN_2022_PROGRAM_ADDRESS,
]);

export interface SplMintInfo {
  mint: Address;
  decimals: number;
  tokenProgramAddress: Address;
}

export interface SplTokenAccountInfo {
  address: Address;
  mint: Address;
  owner: Address;
  tokenProgramAddress: Address;
}

interface ParsedAccountResponse {
  value: {
    owner: string;
    data: unknown;
  } | null;
}

interface ParsedAccountData {
  program?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
}

export async function deriveAssociatedTokenAccount(args: {
  owner: Address;
  mint: Address;
  tokenProgramAddress: Address;
}): Promise<Address> {
  const addressEncoder = getAddressEncoder();
  const [associatedTokenAccount] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addressEncoder.encode(args.owner),
      addressEncoder.encode(args.tokenProgramAddress),
      addressEncoder.encode(args.mint),
    ],
  });
  return associatedTokenAccount;
}

export async function fetchSplMintInfo(
  client: AlchemyClient,
  mint: Address,
): Promise<SplMintInfo> {
  const account = await fetchParsedAccount(client, mint);
  if (!account) {
    throw errInvalidArgs(`SPL token mint ${mint} was not found on this network.`);
  }

  const tokenProgramAddress = address(account.owner);
  assertSupportedTokenProgram(tokenProgramAddress);

  const data = parseAccountData(account.data);
  const decimals = data?.parsed?.info?.decimals;
  if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw errInvalidArgs(`Could not read decimals for SPL token mint ${mint}.`);
  }

  return {
    mint,
    decimals,
    tokenProgramAddress,
  };
}

export async function fetchSplTokenAccountInfo(
  client: AlchemyClient,
  tokenAccount: Address,
): Promise<SplTokenAccountInfo | null> {
  const account = await fetchParsedAccount(client, tokenAccount);
  if (!account) return null;

  const tokenProgramAddress = address(account.owner);
  assertSupportedTokenProgram(tokenProgramAddress);

  const data = parseAccountData(account.data);
  const info = data?.parsed?.info;
  if (!info || data?.parsed?.type !== "account") {
    throw errInvalidArgs(`Account ${tokenAccount} is not an SPL token account.`);
  }

  const mint = readAddressField(info, "mint", `Account ${tokenAccount} is missing token mint metadata.`);
  const owner = readAddressField(info, "owner", `Account ${tokenAccount} is missing token owner metadata.`);

  return {
    address: tokenAccount,
    mint,
    owner,
    tokenProgramAddress,
  };
}

export function buildCreateAssociatedTokenAccountIdempotentInstruction(args: {
  payer: { address: Address };
  associatedTokenAccount: Address;
  owner: Address;
  mint: Address;
  tokenProgramAddress: Address;
}): Instruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer.address, role: AccountRole.WRITABLE_SIGNER },
      { address: args.associatedTokenAccount, role: AccountRole.WRITABLE },
      { address: args.owner, role: AccountRole.READONLY },
      { address: args.mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: args.tokenProgramAddress, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}

export function buildSplTokenTransferCheckedInstruction(args: {
  sourceTokenAccount: Address;
  mint: Address;
  destinationTokenAccount: Address;
  owner: { address: Address };
  amount: bigint;
  decimals: number;
  tokenProgramAddress: Address;
}): Instruction {
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > 255) {
    throw errInvalidArgs("Token decimals must be an integer between 0 and 255.");
  }

  return {
    programAddress: args.tokenProgramAddress,
    accounts: [
      { address: args.sourceTokenAccount, role: AccountRole.WRITABLE },
      { address: args.mint, role: AccountRole.READONLY },
      { address: args.destinationTokenAccount, role: AccountRole.WRITABLE },
      { address: args.owner.address, role: AccountRole.READONLY_SIGNER },
    ],
    data: new Uint8Array([
      12,
      ...encodeU64LE(args.amount),
      args.decimals,
    ]),
  };
}

export function assertTokenAccountMatches(args: {
  account: SplTokenAccountInfo;
  expectedMint: Address;
  expectedOwner?: Address;
  label: string;
}): void {
  if (args.account.mint !== args.expectedMint) {
    throw errInvalidArgs(
      `${args.label} ${args.account.address} is for mint ${args.account.mint}, expected ${args.expectedMint}.`,
    );
  }
  if (args.expectedOwner && args.account.owner !== args.expectedOwner) {
    throw errInvalidArgs(
      `${args.label} ${args.account.address} is owned by ${args.account.owner}, expected ${args.expectedOwner}.`,
    );
  }
}

function assertSupportedTokenProgram(tokenProgramAddress: Address): void {
  if (!SUPPORTED_TOKEN_PROGRAMS.has(tokenProgramAddress)) {
    throw errInvalidArgs(
      `Unsupported Solana token program ${tokenProgramAddress}. Only SPL Token and Token-2022 mints are supported.`,
    );
  }
}

async function fetchParsedAccount(
  client: AlchemyClient,
  accountAddress: Address,
): Promise<NonNullable<ParsedAccountResponse["value"]> | null> {
  const result = await client.call("getAccountInfo", [
    accountAddress,
    { encoding: "jsonParsed" },
  ]) as ParsedAccountResponse;
  return result.value;
}

function parseAccountData(data: unknown): ParsedAccountData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as ParsedAccountData;
}

function readAddressField(
  info: Record<string, unknown>,
  field: string,
  errorMessage: string,
): Address {
  const value = info[field];
  if (typeof value !== "string") {
    throw errInvalidArgs(errorMessage);
  }
  return address(value);
}

function encodeU64LE(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw errInvalidArgs("Amount must fit in an unsigned 64-bit integer.");
  }

  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}
