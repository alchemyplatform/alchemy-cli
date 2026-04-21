import { beforeAll, describe, expect, it } from "vitest";
import { parseJSON, requireLiveConfig, runLiveSolanaCLI } from "./helpers/live-harness.js";
import type { LiveConfig } from "./helpers/live-env.js";

const sponsoredIt = process.env.ALCHEMY_LIVE_SOLANA_GAS_POLICY_ID?.trim() ? it : it.skip;

interface SolanaSendPayload {
  from: string;
  to: string;
  amount: string;
  token: string;
  network: string;
  sponsored: boolean;
  signature: string;
  status: string;
}

describe("live Solana send", () => {
  let config: LiveConfig;

  beforeAll(async () => {
    config = await requireLiveConfig("solana");
  });

  it("sends a dust SOL transfer on devnet", async () => {
    const result = await runLiveSolanaCLI(
      ["send", config.solanaRecipient, config.solanaSendAmount],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<SolanaSendPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.solanaAddress,
      to: config.solanaRecipient,
      amount: config.solanaSendAmount,
      token: "SOL",
      network: config.solanaNetwork,
      sponsored: false,
    });
    expect(payload.status === "confirmed" || payload.status === "pending").toBe(true);
    expect(payload.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  sponsoredIt("sends a sponsored dust SOL transfer on devnet", async () => {
    const result = await runLiveSolanaCLI(
      ["send", config.solanaRecipient, config.solanaSendAmount],
      config,
      { sponsored: true },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<SolanaSendPayload>(result.stdout);
    expect(payload).toMatchObject({
      from: config.solanaAddress,
      to: config.solanaRecipient,
      amount: config.solanaSendAmount,
      token: "SOL",
      network: config.solanaNetwork,
      sponsored: true,
    });
    expect(payload.status === "confirmed" || payload.status === "pending").toBe(true);
    expect(payload.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });
});
