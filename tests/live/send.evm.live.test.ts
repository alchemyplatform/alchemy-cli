import { beforeAll, describe, expect, it } from "vitest";
import { parseJSON, requireLiveConfig, runLiveEvmCLI } from "./helpers/live-harness.js";
import type { LiveConfig } from "./helpers/live-env.js";

const sponsoredIt = process.env.ALCHEMY_LIVE_EVM_GAS_POLICY_ID?.trim() ? it : it.skip;

interface EvmSendPayload {
  from: string;
  to: string;
  amount: string;
  token: string;
  network: string;
  sponsored: boolean;
  txHash: string | null;
  callId: string;
  status: string;
}

describe("live EVM send", () => {
  let config: LiveConfig;

  beforeAll(async () => {
    config = await requireLiveConfig("evm");
  });

  it("sends a dust transfer on Sepolia", async () => {
    const result = await runLiveEvmCLI(
      ["send", config.evmRecipient, config.evmSendAmount],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<EvmSendPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.evmAddress,
      to: config.evmRecipient,
      amount: config.evmSendAmount,
      token: "ETH",
      network: config.evmNetwork,
      sponsored: false,
      status: "success",
    });
    expect(payload.callId).toEqual(expect.any(String));
    expect(payload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  sponsoredIt("sends a sponsored dust transfer on Sepolia", async () => {
    const result = await runLiveEvmCLI(
      ["send", config.evmRecipient, config.evmSendAmount],
      config,
      { sponsored: true },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<EvmSendPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.evmAddress,
      to: config.evmRecipient,
      amount: config.evmSendAmount,
      token: "ETH",
      network: config.evmNetwork,
      sponsored: true,
      status: "success",
    });
    expect(payload.callId).toEqual(expect.any(String));
    expect(payload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});
