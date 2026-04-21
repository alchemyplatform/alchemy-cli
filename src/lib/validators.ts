import { errInvalidArgs } from "./errors.js";
import { isENSName, resolveENS } from "./ens.js";
import type { AlchemyClient } from "./client-interface.js";

export function splitCommaList(input: string): string[] {
  return input.split(",").map((s) => s.trim()).filter(Boolean);
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export async function readStdinArg(name: string): Promise<string> {
  if (process.stdin.isTTY) {
    throw errInvalidArgs(`Missing <${name}>. Provide it as an argument or pipe via stdin.`);
  }

  process.stdin.setEncoding("utf-8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const data = input.trim().split("\n")[0]?.trim() ?? "";
  if (!data) {
    throw errInvalidArgs(`No <${name}> received on stdin.`);
  }
  return data;
}

export async function readStdinLines(name: string): Promise<string[]> {
  if (process.stdin.isTTY) {
    throw errInvalidArgs(`Missing <${name}>. Provide it as an argument or pipe via stdin.`);
  }

  process.stdin.setEncoding("utf-8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    throw errInvalidArgs(`No <${name}> received on stdin.`);
  }
  return lines;
}

export function validateAddress(address: string): void {
  if (!ADDRESS_RE.test(address)) {
    throw errInvalidArgs(
      `Invalid address "${address}". Expected 0x-prefixed 40-hex-character address.`,
    );
  }
}

/**
 * Resolve an address argument: if it's an ENS name (.eth), resolve it via
 * the Universal Resolver. Otherwise validate it as a hex address.
 * Returns the resolved 0x address.
 */
export async function resolveAddress(input: string, client: AlchemyClient): Promise<string> {
  if (isENSName(input)) {
    return resolveENS(input, client);
  }
  validateAddress(input);
  return input;
}

export function validateSolanaAddress(addr: string): void {
  if (!SOLANA_ADDRESS_RE.test(addr)) {
    throw errInvalidArgs(
      `Invalid Solana address "${addr}". Expected base58-encoded address (32-44 characters).`,
    );
  }
}

export function validateSolanaSignature(signature: string): void {
  if (
    !SOLANA_BASE58_RE.test(signature) ||
    signature.length < 64 ||
    signature.length > 128
  ) {
    throw errInvalidArgs(
      `Invalid Solana signature "${signature}". Expected a base58-encoded transaction signature.`,
    );
  }
}

export function validateTxHash(hash: string): void {
  if (!TX_HASH_RE.test(hash)) {
    throw errInvalidArgs(
      `Invalid transaction hash "${hash}". Expected 0x-prefixed 64-hex-character hash.`,
    );
  }
}
