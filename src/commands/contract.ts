import { readFileSync } from "node:fs";
import { Command } from "commander";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  type Abi,
  type Address,
} from "viem";
import { buildWalletClient } from "../lib/smart-wallet.js";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { resolveAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { CLIError, ErrorCode, exitWithError, errInvalidArgs } from "../lib/errors.js";
import { withSpinner, printKeyValueBox, green, dim } from "../lib/ui.js";

/**
 * Parse a human-readable function signature into a viem-compatible ABI.
 *
 * Accepted formats:
 *   "balanceOf(address)(uint256)"       → function with return type
 *   "balanceOf(address)"                → function without return type
 *   "transfer(address,uint256)(bool)"   → function with return type
 *   "quote((address,uint256))(uint256)" → nested tuple input
 *
 * Transforms to viem human-readable ABI:
 *   "function balanceOf(address) returns (uint256)"
 */
function parseSignatureToAbi(signature: string): { abi: Abi; functionName: string } {
  const trimmed = signature.trim();
  const firstParen = trimmed.indexOf("(");
  const functionName = firstParen > 0 ? trimmed.slice(0, firstParen).trim() : "";
  if (!/^\w+$/.test(functionName)) {
    throw errInvalidArgs(
      `Invalid function signature "${trimmed}". Expected format: "functionName(type1,type2)(returnType)" or "functionName(type1,type2)". Nested tuple signatures like "foo((address,uint256))(bool)" are also supported.`,
    );
  }
  const { content: params, nextIndex } = readSignatureGroup(trimmed, firstParen);
  const remainder = trimmed.slice(nextIndex).trim();
  let returns: string | undefined;
  if (remainder.length > 0) {
    if (!remainder.startsWith("(")) {
      throw errInvalidArgs(
        `Invalid function signature "${trimmed}". Unexpected trailing content after the parameter list.`,
      );
    }
    const returnGroup = readSignatureGroup(remainder, 0);
    if (returnGroup.nextIndex !== remainder.length) {
      throw errInvalidArgs(
        `Invalid function signature "${trimmed}". Unexpected trailing content after the return type list.`,
      );
    }
    returns = returnGroup.content;
  }
  let abiString = `function ${functionName}(${params})`;
  if (returns) {
    abiString += ` returns (${returns})`;
  }

  try {
    const abi = parseAbi([abiString]);
    return { abi, functionName };
  } catch (err) {
    throw errInvalidArgs(
      `Could not parse function signature "${trimmed}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function readSignatureGroup(input: string, openIndex: number): { content: string; nextIndex: number } {
  if (openIndex < 0 || input[openIndex] !== "(") {
    throw errInvalidArgs(`Invalid function signature "${input}".`);
  }

  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return {
          content: input.slice(openIndex + 1, i),
          nextIndex: i + 1,
        };
      }
      if (depth < 0) break;
    }
  }

  throw errInvalidArgs(`Invalid function signature "${input}". Unbalanced parentheses.`);
}

function parseAbiInput(input: unknown, sourceLabel: string): Abi {
  if (Array.isArray(input)) {
    return input as Abi;
  }

  if (input && typeof input === "object") {
    const artifact = input as { abi?: unknown };
    if (Array.isArray(artifact.abi)) {
      return artifact.abi as Abi;
    }
  }

  throw errInvalidArgs(
    `Invalid ABI in ${sourceLabel}. Expected a JSON ABI array or an object with an "abi" array.`,
  );
}

/**
 * Resolve ABI from --abi-file, --abi, or inline function signature.
 */
function resolveAbi(
  functionArg: string,
  opts: { abiFile?: string; abi?: string },
): { abi: Abi; functionName: string } {
  if (opts.abiFile) {
    let raw: string;
    try {
      raw = readFileSync(opts.abiFile, "utf-8");
    } catch {
      throw errInvalidArgs(`Could not read ABI file: ${opts.abiFile}`);
    }
    try {
      const abi = parseAbiInput(JSON.parse(raw), `ABI file "${opts.abiFile}"`);
      return { abi, functionName: functionArg };
    } catch {
      throw errInvalidArgs(`Invalid JSON or ABI in ABI file: ${opts.abiFile}`);
    }
  }

  if (opts.abi) {
    try {
      const abi = parseAbiInput(JSON.parse(opts.abi), "--abi");
      return { abi, functionName: functionArg };
    } catch {
      throw errInvalidArgs("Invalid JSON or ABI in --abi value.");
    }
  }

  // Parse as human-readable signature
  return parseSignatureToAbi(functionArg);
}

function parseArgs(argsJson?: string): unknown[] {
  if (!argsJson) return [];
  try {
    const parsed = JSON.parse(argsJson);
    if (!Array.isArray(parsed)) {
      throw errInvalidArgs("--args must be a JSON array.");
    }
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.includes("--args must be")) throw err;
    throw errInvalidArgs(`Invalid JSON in --args: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function formatResult(decoded: unknown): string {
  const normalized = normalizeDecodedValue(decoded);
  if (typeof normalized === "string") return normalized;
  if (typeof normalized === "boolean") return String(normalized);
  if (typeof normalized === "number") return String(normalized);
  if (normalized === null || normalized === undefined) return String(normalized);
  return JSON.stringify(normalized);
}

function normalizeDecodedValue(decoded: unknown): unknown {
  if (typeof decoded === "bigint") return decoded.toString();
  if (Array.isArray(decoded)) return decoded.map(normalizeDecodedValue);
  if (decoded && typeof decoded === "object") {
    return Object.fromEntries(
      Object.entries(decoded as Record<string, unknown>).map(([key, value]) => [
        key,
        normalizeDecodedValue(value),
      ]),
    );
  }
  return decoded;
}

function resolveBlockParam(block?: string): string {
  let blockParam = block ?? "latest";
  if (blockParam !== "latest" && blockParam !== "earliest" && blockParam !== "pending") {
    if (!blockParam.startsWith("0x")) {
      const num = parseInt(blockParam, 10);
      if (isNaN(num) || num < 0) {
        throw errInvalidArgs("Block must be a number, hex, or tag (latest, earliest, pending).");
      }
      blockParam = `0x${num.toString(16)}`;
    }
  }
  return blockParam;
}

function parseEthValue(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw errInvalidArgs("--value is required.");
  }
  if (trimmed.startsWith("-")) {
    throw errInvalidArgs(`Invalid --value "${value}". Value must be zero or a positive number.`);
  }

  const parts = trimmed.split(".");
  if (parts.length > 2 || !/\d/.test(trimmed)) {
    throw errInvalidArgs(`Invalid --value "${value}".`);
  }

  const whole = parts[0] || "0";
  let fractional = parts[1] || "";
  if (!/^\d+$/.test(whole) || (fractional.length > 0 && !/^\d+$/.test(fractional))) {
    throw errInvalidArgs(`Invalid --value "${value}".`);
  }
  if (fractional.length > 18) {
    throw errInvalidArgs("Too many decimal places for ETH value (max 18).");
  }

  fractional = fractional.padEnd(18, "0");
  try {
    return BigInt(whole + fractional);
  } catch {
    throw errInvalidArgs(`Invalid --value "${value}".`);
  }
}

function createContractCallStatusError(
  id: string,
  status: string,
  txHash: string | undefined,
): CLIError {
  const details = [
    `Status: ${status}`,
    `Call ID: ${id}`,
    txHash ? `Transaction hash: ${txHash}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return new CLIError(
    ErrorCode.RPC_ERROR,
    `Contract call failed with status "${status}".`,
    undefined,
    details,
    {
      callId: id,
      status,
      txHash: txHash ?? null,
    },
  );
}

interface ContractOpts {
  args?: string;
  abiFile?: string;
  abi?: string;
  value?: string;
  block?: string;
}

export function registerContract(program: Command) {
  const cmd = program.command("contract").description("Interact with smart contracts");

  // ── contract read ───────────────────────────────────────────────────

  cmd
    .command("read")
    .description("Call a view/pure contract function (eth_call)")
    .argument("<address>", "Contract address (0x...) or ENS name")
    .argument("<function>", 'Function signature, e.g. "balanceOf(address)(uint256)"')
    .option("--args <json>", "Function arguments as JSON array")
    .option("--abi-file <path>", "Path to ABI JSON file")
    .option("--abi <json>", "Inline ABI JSON")
    .option("--block <block>", "Block number, hex, or tag (default: latest)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy contract read 0xA0b8...USDC "balanceOf(address)(uint256)" --args '["0xHolder"]'
  alchemy contract read 0xA0b8...USDC "name()(string)"
  alchemy contract read 0xA0b8...USDC "decimals()(uint8)"
  alchemy contract read 0xContract balanceOf --abi-file ./erc20.json --args '["0xHolder"]'
  alchemy contract read 0xPool "quote((address,uint256))(uint256)" --args '[["0xToken", "1000000"]]' --block 12345678`,
    )
    .action(async (addressArg: string, functionArg: string, opts: ContractOpts) => {
      try {
        await performContractRead(program, addressArg, functionArg, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── contract call ───────────────────────────────────────────────────

  cmd
    .command("call")
    .description("Execute a state-changing contract function")
    .argument("<address>", "Contract address (0x...) or ENS name")
    .argument("<function>", 'Function signature, e.g. "approve(address,uint256)"')
    .option("--args <json>", "Function arguments as JSON array")
    .option("--abi-file <path>", "Path to ABI JSON file")
    .option("--abi <json>", "Inline ABI JSON")
    .option("--value <ether>", "ETH value to send (in ether, for payable functions)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy contract call 0xToken "approve(address,uint256)" --args '["0xSpender", "1000000"]'
  alchemy contract call 0xToken "transfer(address,uint256)" --args '["0xTo", "1000000"]'
  alchemy contract call 0xContract deposit --abi-file ./contract.json --value 0.1`,
    )
    .action(async (addressArg: string, functionArg: string, opts: ContractOpts) => {
      try {
        await performContractCall(program, addressArg, functionArg, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

// ── Read implementation ─────────────────────────────────────────────

export async function performContractRead(
  program: Command,
  addressArg: string,
  functionArg: string,
  opts: ContractOpts,
) {
  const { abi, functionName } = resolveAbi(functionArg, opts);
  const args = parseArgs(opts.args);
  const blockParam = resolveBlockParam(opts.block);
  const block = opts.block ?? "latest";

  const client = clientFromFlags(program);
  const contractAddress = await resolveAddress(addressArg, client);
  const network = resolveNetwork(program);

  const data = encodeFunctionData({ abi, functionName, args });

  const raw = await withSpinner(
    "Reading contract…",
    "Contract read complete",
    () => client.call("eth_call", [{ to: contractAddress, data }, blockParam]),
  ) as string;

  // Try to decode if ABI has return types
  let decoded: unknown;
  let hasReturnType = false;
  try {
    decoded = decodeFunctionResult({ abi, functionName, data: raw as `0x${string}` });
    hasReturnType = true;
  } catch {
    // No return type in ABI or decode failed — show raw
    decoded = raw;
  }

  if (isJSONMode()) {
    printJSON({
      contract: contractAddress,
      function: functionName,
      network,
      block,
      result: hasReturnType ? normalizeDecodedValue(decoded) : undefined,
      raw,
    });
  } else {
    const pairs: [string, string][] = [
      ["Contract", contractAddress],
      ["Function", functionName],
      ["Network", network],
      ["Block", block],
    ];

    if (hasReturnType) {
      pairs.push(["Result", green(formatResult(decoded))]);
    }

    pairs.push(["Raw", dim(raw)]);

    printKeyValueBox(pairs);
  }
}

// ── Call implementation ─────────────────────────────────────────────

export async function performContractCall(
  program: Command,
  addressArg: string,
  functionArg: string,
  opts: ContractOpts,
) {
  const { abi, functionName } = resolveAbi(functionArg, opts);
  const args = parseArgs(opts.args);

  const { client, network, address: from, paymaster } = buildWalletClient(program);

  const rpcClient = clientFromFlags(program);
  const contractAddress = await resolveAddress(addressArg, rpcClient) as Address;

  const data = encodeFunctionData({ abi, functionName, args });

  // Parse optional ETH value
  const value = opts.value !== undefined ? parseEthValue(opts.value) : undefined;

  const call: { to: Address; data: `0x${string}`; value?: bigint } = {
    to: contractAddress,
    data: data as `0x${string}`,
  };
  if (value !== undefined) call.value = value;

  const { id } = await withSpinner(
    "Sending transaction…",
    "Transaction submitted",
    () => client.sendCalls({
      calls: [call],
      capabilities: paymaster ? { paymaster } : undefined,
    }),
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Transaction confirmed",
    () => client.waitForCallsStatus({ id }),
  );

  const txHash = status.receipts?.[0]?.transactionHash;
  const callStatus = status.status ?? "unknown";
  if (callStatus !== "success") {
    throw createContractCallStatusError(id, callStatus, txHash);
  }

  if (isJSONMode()) {
    printJSON({
      from,
      to: contractAddress,
      function: functionName,
      network,
      sponsored: !!paymaster,
      txHash: txHash ?? null,
      callId: id,
      status: callStatus,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", from],
      ["Contract", contractAddress],
      ["Function", functionName],
      ["Network", network],
    ];

    if (paymaster) {
      pairs.push(["Gas", green("Sponsored")]);
    }

    if (txHash) {
      pairs.push(["Tx Hash", txHash]);
    }

    pairs.push(["Status", green("Confirmed")]);

    printKeyValueBox(pairs);
  }
}
