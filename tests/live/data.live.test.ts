import { beforeAll, describe, expect, it } from "vitest";
import {
  parseJSON,
  requireLiveConfig,
  runLiveEvmCLI,
} from "./helpers/live-harness.js";
import type { LiveConfig } from "./helpers/live-env.js";

interface BalancePayload {
  address: string;
  wei: string;
  balance: string;
  symbol: string;
  network: string;
}

interface TokenBalancesPayload {
  address: string;
  tokenBalances: unknown[];
  pageKey?: string;
}

interface NFTsPayload {
  ownedNfts: unknown[];
  totalCount: number;
  pageKey?: string;
}

interface HistoryPayload {
  transfers: unknown[];
  pageKey?: string;
}

describe("live data commands", () => {
  let config: LiveConfig;

  beforeAll(async () => {
    config = await requireLiveConfig("evm");
  });

  it("smoke tests data balance", async () => {
    const result = await runLiveEvmCLI(
      ["data", "balance", config.evmAddress],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<BalancePayload>(result.stdout);
    expect(payload).toMatchObject({
      address: config.evmAddress,
      symbol: "ETH",
      network: config.evmNetwork,
    });
    expect(payload.wei).toEqual(expect.any(String));
    expect(payload.balance).toEqual(expect.any(String));
  });

  it("smoke tests data tokens balances", async () => {
    const result = await runLiveEvmCLI(
      ["data", "tokens", "balances", config.evmAddress],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<TokenBalancesPayload>(result.stdout);
    expect(payload.address.toLowerCase()).toBe(config.evmAddress.toLowerCase());
    expect(Array.isArray(payload.tokenBalances)).toBe(true);
  });

  it("smoke tests data nfts", async () => {
    const result = await runLiveEvmCLI(
      ["data", "nfts", config.evmAddress],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<NFTsPayload>(result.stdout);
    expect(Array.isArray(payload.ownedNfts)).toBe(true);
    expect(typeof payload.totalCount).toBe("number");
  });

  it("smoke tests data history", async () => {
    const result = await runLiveEvmCLI(
      ["data", "history", config.evmAddress, "--max-count", "1"],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<HistoryPayload>(result.stdout);
    expect(Array.isArray(payload.transfers)).toBe(true);
  });

  it("smoke tests data price symbol", async () => {
    const result = await runLiveEvmCLI(
      ["data", "price", "symbol", "ETH"],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<unknown>(result.stdout);
    expect(payload).not.toBeNull();
    expect(typeof payload).toBe("object");
  });

  it("smoke tests data portfolio tokens", async () => {
    const result = await runLiveEvmCLI(
      [
        "data",
        "portfolio",
        "tokens",
        "--body",
        JSON.stringify({
          addresses: [
            {
              address: config.evmAddress,
              networks: [config.evmNetwork],
            },
          ],
        }),
      ],
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");

    const payload = parseJSON<unknown>(result.stdout);
    expect(payload).not.toBeNull();
    expect(typeof payload).toBe("object");
  });
});
