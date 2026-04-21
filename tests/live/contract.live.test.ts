import { beforeAll, describe, expect, it } from "vitest";
import { parseJSON, requireLiveConfig, runLiveEvmCLI } from "./helpers/live-harness.js";
import type { LiveConfig } from "./helpers/live-env.js";

const sponsoredIt = process.env.ALCHEMY_LIVE_EVM_GAS_POLICY_ID?.trim() ? it : it.skip;

interface ContractReadPayload {
  contract: string;
  function: string;
  network: string;
  block: string;
  result?: unknown;
  raw: string;
}

interface ContractCallPayload {
  from: string;
  to: string;
  function: string;
  network: string;
  sponsored: boolean;
  txHash: string | null;
  callId: string;
  status: string;
}

describe("live contract commands", () => {
  let config: LiveConfig;

  beforeAll(async () => {
    config = await requireLiveConfig("evm");
  });

  it("reads the configured WETH contract", async () => {
    const result = await runLiveEvmCLI(
      ["contract", "read", config.evmContractAddress, "name()(string)"],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<ContractReadPayload>(result.stdout);
    expect(payload).toMatchObject({
      contract: config.evmContractAddress,
      function: "name",
      network: config.evmNetwork,
      block: "latest",
    });
    expect(payload.result).toBe("Wrapped Ether");
    expect(payload.raw).toMatch(/^0x[0-9a-fA-F]*$/);
  });

  it("writes an allowance and reads it back", async () => {
    const nextValue = String(Date.now());
    const write = await runLiveEvmCLI(
      [
        "contract",
        "call",
        config.evmContractAddress,
        "approve(address,uint256)(bool)",
        "--args",
        JSON.stringify([config.evmRecipient, nextValue]),
      ],
      config,
    );

    expect(write.exitCode).toBe(0);
    expect(write.stderr).toBe("");

    const writePayload = parseJSON<ContractCallPayload>(write.stdout);
    expect(writePayload).toMatchObject({
      from: config.evmAddress,
      to: config.evmContractAddress,
      function: "approve",
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
    const readPayload = parseJSON<ContractReadPayload>(read.stdout);
    expect(readPayload.result).toBe(nextValue);
  });

  it("calls the payable deposit method", async () => {
    const result = await runLiveEvmCLI(
      [
        "contract",
        "call",
        config.evmContractAddress,
        "deposit()",
        "--value",
        config.evmDepositAmount,
      ],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<ContractCallPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.evmAddress,
      to: config.evmContractAddress,
      function: "deposit",
      network: config.evmNetwork,
      sponsored: false,
      status: "success",
    });
    expect(payload.callId).toEqual(expect.any(String));
    expect(payload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  sponsoredIt("writes a sponsored allowance update", async () => {
    const nextValue = String(Date.now() + 1);
    const write = await runLiveEvmCLI(
      [
        "contract",
        "call",
        config.evmContractAddress,
        "approve(address,uint256)(bool)",
        "--args",
        JSON.stringify([config.evmRecipient, nextValue]),
      ],
      config,
      { sponsored: true },
    );

    expect(write.exitCode).toBe(0);
    expect(write.stderr).toBe("");

    const writePayload = parseJSON<ContractCallPayload>(write.stdout);
    expect(writePayload).toMatchObject({
      from: config.evmAddress,
      to: config.evmContractAddress,
      function: "approve",
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
    const readPayload = parseJSON<ContractReadPayload>(read.stdout);
    expect(readPayload.result).toBe(nextValue);
  });

  sponsoredIt("calls the payable deposit method with sponsorship", async () => {
    const result = await runLiveEvmCLI(
      [
        "contract",
        "call",
        config.evmContractAddress,
        "deposit()",
        "--value",
        config.evmDepositAmount,
      ],
      config,
      { sponsored: true },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<ContractCallPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.evmAddress,
      to: config.evmContractAddress,
      function: "deposit",
      network: config.evmNetwork,
      sponsored: true,
      status: "success",
    });
    expect(payload.callId).toEqual(expect.any(String));
    expect(payload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});
