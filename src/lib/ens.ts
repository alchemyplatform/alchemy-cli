import { keccak_256 } from "@noble/hashes/sha3.js";
import { errInvalidArgs } from "./errors.js";
import type { AlchemyClient } from "./client-interface.js";

// Universal Resolver on Ethereum mainnet
const UNIVERSAL_RESOLVER = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

// Function selectors
const RESOLVE_SELECTOR = "9061b923"; // resolve(bytes,bytes)
const ADDR_SELECTOR = "3b3b57de"; // addr(bytes32)

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pad32(hex: string): string {
  return hex.padStart(64, "0");
}

/**
 * EIP-137 namehash: recursive keccak256 over dot-separated labels.
 */
export function namehash(name: string): Uint8Array {
  let node = new Uint8Array(32);
  if (!name) return node;

  const labels = name.split(".");
  for (let i = labels.length - 1; i >= 0; i--) {
    const labelHash = keccak_256(new TextEncoder().encode(labels[i]));
    const combined = new Uint8Array(64);
    combined.set(node, 0);
    combined.set(labelHash, 32);
    node = keccak_256(combined);
  }
  return node;
}

/**
 * DNS wire format: length-prefixed labels terminated by zero byte.
 * "vitalik.eth" → [7, v, i, t, a, l, i, k, 3, e, t, h, 0]
 */
export function dnsEncode(name: string): Uint8Array {
  const labels = name.split(".");
  const parts: number[] = [];
  for (const label of labels) {
    const encoded = new TextEncoder().encode(label);
    parts.push(encoded.length);
    parts.push(...encoded);
  }
  parts.push(0);
  return new Uint8Array(parts);
}

/**
 * ABI-encode resolve(bytes name, bytes data) for the Universal Resolver.
 */
function buildResolveCalldata(name: string): string {
  const dnsName = dnsEncode(name);
  const node = namehash(name);

  // Inner call: addr(bytes32) — 4 + 32 = 36 bytes
  const innerHex = ADDR_SELECTOR + bytesToHex(node);
  const innerLen = 36;

  const dnsHex = bytesToHex(dnsName);
  const nameLen = dnsName.length;

  const namePad = Math.ceil(nameLen / 32) * 32;
  const innerPad = Math.ceil(innerLen / 32) * 32;

  // Two dynamic args → offsets start at 0x40
  const nameOffset = 64;
  const dataOffset = nameOffset + 32 + namePad;

  let hex = RESOLVE_SELECTOR;
  hex += pad32(nameOffset.toString(16));
  hex += pad32(dataOffset.toString(16));
  hex += pad32(nameLen.toString(16));
  hex += dnsHex.padEnd(namePad * 2, "0");
  hex += pad32(innerLen.toString(16));
  hex += innerHex.padEnd(innerPad * 2, "0");

  return "0x" + hex;
}

/**
 * Returns true if the string looks like an ENS name.
 */
export function isENSName(value: string): boolean {
  return value.endsWith(".eth") && value.length > 4 && !value.startsWith("0x");
}

/**
 * Resolve an ENS name to an address via the Universal Resolver.
 * Only works on Ethereum networks.
 */
export async function resolveENS(name: string, client: AlchemyClient): Promise<string> {
  if (!client.network.startsWith("eth-")) {
    throw errInvalidArgs(
      `ENS resolution is only supported on Ethereum networks. Current network: ${client.network}`,
    );
  }

  const calldata = buildResolveCalldata(name.toLowerCase());

  const result = await client.call("eth_call", [
    { to: UNIVERSAL_RESOLVER, data: calldata },
    "latest",
  ]) as string;

  if (!result || result === "0x" || result.length < 130) {
    throw errInvalidArgs(`ENS name "${name}" could not be resolved.`);
  }

  // Decode ABI response: (bytes data, address resolver)
  const raw = result.slice(2);
  const dataOffset = parseInt(raw.slice(0, 64), 16) * 2;
  const dataLen = parseInt(raw.slice(dataOffset, dataOffset + 64), 16);
  const dataHex = raw.slice(dataOffset + 64, dataOffset + 64 + dataLen * 2);

  // addr(bytes32) returns address as 32 bytes, left-padded — take last 40 hex chars
  if (dataHex.length < 64) {
    throw errInvalidArgs(`ENS name "${name}" could not be resolved.`);
  }
  const address = "0x" + dataHex.slice(24, 64);

  if (address === "0x0000000000000000000000000000000000000000") {
    throw errInvalidArgs(`ENS name "${name}" is not registered or has no address set.`);
  }

  return address;
}
