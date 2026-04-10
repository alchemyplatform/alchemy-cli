import { beforeAll, describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { parseJSON, requireLiveConfig, runLiveEvmCLI } from "./helpers/live-harness.js";
import type { LiveConfig } from "./helpers/live-env.js";

const sponsoredIt = process.env.ALCHEMY_LIVE_EVM_GAS_POLICY_ID?.trim() ? it : it.skip;

interface ApprovePayload {
  from: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spender: string;
  approvalType: "exact" | "unlimited" | "revoke";
  inputAmount: string | null;
  requestedAllowanceRaw: string;
  requestedAllowanceDisplay: string;
  currentAllowanceRaw: string;
  currentAllowanceDisplay: string;
  resetFirst: boolean;
  network: string;
  sponsored: boolean;
  txHash: string | null;
  callId: string;
  status: string;
}

interface ContractReadPayload {
  contract: string;
  function: string;
  network: string;
  block: string;
  result?: unknown;
  raw: string;
}

function buildApproveAmount(seed: number): string {
  const fractional = String(seed % 1_000_000).padStart(6, "0");
  return `0.000001${fractional}`;
}

describe("live approve command", () => {
  let config: LiveConfig;

  beforeAll(async () => {
    config = await requireLiveConfig("evm");
  });

  it("writes an allowance on Sepolia and reads it back", async () => {
    const amount = buildApproveAmount(Date.now());
    const write = await runLiveEvmCLI(
      [
        "approve",
        config.evmContractAddress,
        "--spender",
        config.evmRecipient,
        "--amount",
        amount,
        "--reset-first",
      ],
      config,
    );

    expect(write.exitCode).toBe(0);
    expect(write.stderr).toBe("");

    const writePayload = parseJSON<ApprovePayload>(write.stdout);
    const expectedAllowance = parseUnits(amount, writePayload.tokenDecimals).toString();

    expect(writePayload).toMatchObject({
      from: config.evmAddress,
      token: config.evmContractAddress,
      spender: config.evmRecipient,
      approvalType: "exact",
      inputAmount: amount,
      requestedAllowanceRaw: expectedAllowance,
      network: config.evmNetwork,
      sponsored: false,
      status: "success",
    });
    expect(writePayload.callId).toEqual(expect.any(String));
    expect(writePayload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const read = await runLiveEvmCLI(
      [
        "contract",
        "read",
        config.evmContractAddress,
        "allowance(address,address)(uint256)",
        "--args",
        JSON.stringify([config.evmAddress, config.evmRecipient]),
      ],
      config,
    );

    expect(read.exitCode).toBe(0);
    expect(read.stderr).toBe("");

    const readPayload = parseJSON<ContractReadPayload>(read.stdout);
    expect(readPayload).toMatchObject({
      contract: config.evmContractAddress,
      function: "allowance",
      network: config.evmNetwork,
      block: "latest",
      result: expectedAllowance,
    });
    expect(readPayload.raw).toMatch(/^0x[0-9a-fA-F]*$/);
  });

  sponsoredIt("writes a sponsored allowance update on Sepolia and reads it back", async () => {
    const amount = buildApproveAmount(Date.now() + 1);
    const write = await runLiveEvmCLI(
      [
        "approve",
        config.evmContractAddress,
        "--spender",
        config.evmRecipient,
        "--amount",
        amount,
        "--reset-first",
      ],
      config,
      { sponsored: true },
    );

    expect(write.exitCode).toBe(0);
    expect(write.stderr).toBe("");

    const writePayload = parseJSON<ApprovePayload>(write.stdout);
    const expectedAllowance = parseUnits(amount, writePayload.tokenDecimals).toString();

    expect(writePayload).toMatchObject({
      from: config.evmAddress,
      token: config.evmContractAddress,
      spender: config.evmRecipient,
      approvalType: "exact",
      inputAmount: amount,
      requestedAllowanceRaw: expectedAllowance,
      network: config.evmNetwork,
      sponsored: true,
      status: "success",
    });
    expect(writePayload.callId).toEqual(expect.any(String));
    expect(writePayload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const read = await runLiveEvmCLI(
      [
        "contract",
        "read",
        config.evmContractAddress,
        "allowance(address,address)(uint256)",
        "--args",
        JSON.stringify([config.evmAddress, config.evmRecipient]),
      ],
      config,
    );

    expect(read.exitCode).toBe(0);
    expect(read.stderr).toBe("");

    const readPayload = parseJSON<ContractReadPayload>(read.stdout);
    expect(readPayload.result).toBe(expectedAllowance);
    expect(readPayload.raw).toMatch(/^0x[0-9a-fA-F]*$/);
  });
});
