import { errInvalidArgs } from "./errors.js";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
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

export function validateAddress(address: string): void {
  if (!ADDRESS_RE.test(address)) {
    throw errInvalidArgs(
      `Invalid address "${address}". Expected 0x-prefixed 40-hex-character address.`,
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
