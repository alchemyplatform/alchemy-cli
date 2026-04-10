import { Command } from "commander";
import {
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  type Address,
} from "viem";
import { buildWalletClient } from "../lib/smart-wallet.js";
import { clientFromFlags } from "../lib/resolve.js";
import type { AlchemyClient } from "../lib/client-interface.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { validateAddress } from "../lib/validators.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import {
  CLIError,
  ErrorCode,
  exitWithError,
  errInvalidArgs,
} from "../lib/errors.js";
import { promptConfirm } from "../lib/terminal-ui.js";
import { withSpinner, printKeyValueBox, green, dim } from "../lib/ui.js";
import { parseAmount, fetchTokenDecimals } from "./send/shared.js";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;

interface ApproveOpts {
  spender: string;
  amount?: string;
  unlimited?: boolean;
  revoke?: boolean;
  resetFirst?: boolean;
  yes?: boolean;
}

type TokenMeta = {
  decimals: number;
  symbol: string;
};

type ApprovalRequest =
  | {
      kind: "exact";
      inputAmount: string;
      rawAmount: bigint;
      displayAmount: string;
    }
  | {
      kind: "unlimited";
      inputAmount: null;
      rawAmount: bigint;
      displayAmount: string;
    }
  | {
      kind: "revoke";
      inputAmount: null;
      rawAmount: bigint;
      displayAmount: string;
    };

function isNativeToken(address: string): boolean {
  return address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  const str = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, str.length - decimals) || "0";
  const frac = str.slice(str.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function buildApprovalRequest(opts: ApproveOpts, tokenMeta: TokenMeta): ApprovalRequest {
  validateApprovalMode(opts);

  if (opts.revoke) {
    return {
      kind: "revoke",
      inputAmount: null,
      rawAmount: 0n,
      displayAmount: `0 ${tokenMeta.symbol} (revoke)`,
    };
  }

  if (opts.unlimited) {
    return {
      kind: "unlimited",
      inputAmount: null,
      rawAmount: maxUint256,
      displayAmount: `Unlimited ${tokenMeta.symbol}`,
    };
  }

  const inputAmount = opts.amount ?? "";
  return {
    kind: "exact",
    inputAmount,
    rawAmount: parseAmount(inputAmount, tokenMeta.decimals),
    displayAmount: `${inputAmount} ${tokenMeta.symbol}`,
  };
}

function validateApprovalMode(opts: ApproveOpts): void {
  const modeCount = [
    opts.amount !== undefined,
    opts.unlimited === true,
    opts.revoke === true,
  ].filter(Boolean).length;

  if (modeCount !== 1) {
    throw errInvalidArgs("Provide exactly one of --amount, --unlimited, or --revoke.");
  }

  if (opts.resetFirst && opts.revoke) {
    throw errInvalidArgs("Do not use --reset-first with --revoke. Revoking already sets allowance to 0.");
  }
}

function createApproveStatusError(
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
    `Approval failed with status "${status}".`,
    undefined,
    details,
    {
      callId: id,
      status,
      txHash: txHash ?? null,
    },
  );
}

async function readCurrentAllowance(
  client: AlchemyClient,
  tokenAddress: string,
  owner: Address,
  spender: string,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender as Address],
  });

  try {
    const raw = await client.call("eth_call", [{ to: tokenAddress, data }, "latest"]) as `0x${string}`;
    return decodeFunctionResult({
      abi: erc20Abi,
      functionName: "allowance",
      data: raw,
    }) as bigint;
  } catch (err) {
    throw errInvalidArgs(
      `Failed to read current allowance for ${tokenAddress}. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function confirmUnlimitedApproval(
  program: Command,
  tokenSymbol: string,
  spender: string,
  opts: ApproveOpts,
): Promise<boolean> {
  if (!opts.unlimited) return true;
  if (opts.yes) return true;

  if (!isInteractiveAllowed(program)) {
    throw errInvalidArgs("Unlimited approval requires confirmation. Re-run with --yes to confirm.");
  }

  const proceed = await promptConfirm({
    message: `Grant unlimited ${tokenSymbol} allowance to ${spender}?`,
    initialValue: false,
    cancelMessage: "Cancelled unlimited approval.",
  });
  if (proceed === null) return false;
  if (!proceed) {
    console.log(`  ${dim("Skipped unlimited approval.")}`);
    return false;
  }
  return true;
}

function requiresAllowanceReset(
  currentAllowance: bigint,
  requestedAllowance: bigint,
): boolean {
  return currentAllowance > 0n && requestedAllowance > 0n && currentAllowance !== requestedAllowance;
}

export function registerApprove(program: Command) {
  program
    .command("approve")
    .description("Approve an ERC-20 token allowance for a spender")
    .argument("<token_address>", "ERC-20 token contract address")
    .requiredOption("--spender <spender_address>", "Address to approve spending")
    .option("--amount <decimal_amount>", "Amount to approve in decimal token units (for example, 100.5)")
    .option("--unlimited", "Approve the maximum allowance")
    .option("--revoke", "Revoke approval (set allowance to 0)")
    .option("--reset-first", "Clear an existing non-zero allowance before setting a new non-zero allowance")
    .option("-y, --yes", "Skip confirmation prompt for unlimited approval")
    .addHelpText(
      "after",
      `
Examples:
  alchemy approve 0xUSDC --spender 0xRouter --amount 100
  alchemy approve 0xUSDC --spender 0xRouter --amount 100 --reset-first
  alchemy approve 0xUSDC --spender 0xRouter --unlimited
  alchemy approve 0xUSDC --spender 0xRouter --unlimited --yes
  alchemy approve 0xUSDC --spender 0xRouter --revoke`,
    )
    .action(async (tokenArg: string, opts: ApproveOpts) => {
      try {
        await performApprove(program, tokenArg, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

async function performApprove(
  program: Command,
  tokenArg: string,
  opts: ApproveOpts,
) {
  validateAddress(tokenArg);
  validateAddress(opts.spender);

  if (isNativeToken(tokenArg)) {
    throw errInvalidArgs("Native tokens do not support ERC-20 approvals. Provide an ERC-20 token contract address.");
  }

  validateApprovalMode(opts);

  const { client, network, address: from, paymaster } = buildWalletClient(program);
  const rpcClient = clientFromFlags(program);
  const tokenMeta = await fetchTokenDecimals(program, tokenArg);
  const approval = buildApprovalRequest(opts, tokenMeta);

  if (!await confirmUnlimitedApproval(program, tokenMeta.symbol, opts.spender, opts)) {
    return;
  }

  const currentAllowance = await readCurrentAllowance(rpcClient, tokenArg, from, opts.spender);
  const currentAllowanceDisplay = `${formatTokenAmount(currentAllowance, tokenMeta.decimals)} ${tokenMeta.symbol}`;
  const shouldResetFirst = opts.resetFirst === true && requiresAllowanceReset(currentAllowance, approval.rawAmount);

  if (requiresAllowanceReset(currentAllowance, approval.rawAmount) && !opts.resetFirst) {
    throw errInvalidArgs(
      `Current allowance for ${tokenMeta.symbol} is already non-zero. Some ERC-20 tokens reject changing a non-zero allowance directly. Re-run with --reset-first to set the allowance to 0 before applying the new value.`,
    );
  }

  const calls = shouldResetFirst
    ? [
        {
          to: tokenArg as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [opts.spender as Address, 0n],
          }),
        },
        {
          to: tokenArg as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [opts.spender as Address, approval.rawAmount],
          }),
        },
      ]
    : [
        {
          to: tokenArg as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [opts.spender as Address, approval.rawAmount],
          }),
        },
      ];

  const { id } = await withSpinner(
    "Sending approval…",
    "Approval submitted",
    () => client.sendCalls({
      calls,
      capabilities: paymaster ? { paymaster } : undefined,
    }),
  );

  const status = await withSpinner(
    "Waiting for confirmation…",
    "Approval confirmed",
    () => client.waitForCallsStatus({ id }),
  );

  const txHash = status.receipts?.[0]?.transactionHash;
  const approvalStatus = status.status ?? "unknown";
  if (approvalStatus !== "success") {
    throw createApproveStatusError(id, approvalStatus, txHash);
  }

  if (isJSONMode()) {
    printJSON({
      from,
      token: tokenArg,
      tokenSymbol: tokenMeta.symbol,
      tokenDecimals: tokenMeta.decimals,
      spender: opts.spender,
      approvalType: approval.kind,
      inputAmount: approval.inputAmount,
      requestedAllowanceRaw: approval.rawAmount.toString(),
      requestedAllowanceDisplay: approval.displayAmount,
      currentAllowanceRaw: currentAllowance.toString(),
      currentAllowanceDisplay,
      resetFirst: shouldResetFirst,
      network,
      sponsored: !!paymaster,
      txHash: txHash ?? null,
      callId: id,
      status: approvalStatus,
    });
  } else {
    const pairs: [string, string][] = [
      ["From", from],
      ["Token", `${tokenMeta.symbol} (${tokenArg})`],
      ["Spender", opts.spender],
      ["Current Allowance", currentAllowanceDisplay],
      ["Requested Allowance", green(approval.displayAmount)],
      ...(shouldResetFirst ? [["Allowance Update", "Reset to 0, then approve"]] as [string, string][] : []),
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
