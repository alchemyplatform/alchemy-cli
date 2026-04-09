import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunCLIResult } from "../../e2e/helpers/run-cli.js";
import { runCLI } from "../../e2e/helpers/run-cli.js";
import {
  formatEvmBalance,
  formatSolBalance,
  getLiveBalanceStatus,
  loadLiveConfig,
  type LiveConfig,
} from "./live-env.js";

export type LiveScope = "evm" | "solana" | "all";
export interface LiveRunOptions {
  sponsored?: boolean;
}

export function parseJSON<T>(text: string): T {
  return JSON.parse(text.trim()) as T;
}

const liveConfigRootDir = mkdtempSync(join(tmpdir(), "alchemy-cli-live-"));
let liveConfigCleanupRegistered = false;

function cleanupLiveConfigRootDir(): void {
  rmSync(liveConfigRootDir, { recursive: true, force: true });
}

function ensureLiveConfigCleanup(): void {
  if (liveConfigCleanupRegistered) return;
  liveConfigCleanupRegistered = true;
  process.once("exit", cleanupLiveConfigRootDir);
}

function createIsolatedConfigPath(): string {
  ensureLiveConfigCleanup();
  return join(liveConfigRootDir, `${randomUUID()}.json`);
}

function buildFundingMessage(config: LiveConfig, scope: LiveScope, balances: Awaited<ReturnType<typeof getLiveBalanceStatus>>): string {
  const introLine = "Live test wallets need funding before this suite can run.";
  const evmLines = [
    `EVM sender: ${config.evmAddress}`,
    `EVM balance: ${formatEvmBalance(balances.evmWei ?? 0n)} (minimum ${formatEvmBalance(config.minEvmWei)})`,
  ];
  const solanaLines = [
    `Solana sender: ${config.solanaAddress}`,
    `Solana balance: ${formatSolBalance(balances.solLamports ?? 0n)} (minimum ${formatSolBalance(config.minSolLamports)})`,
  ];

  if (scope === "evm" && !balances.evmReady) return [introLine, ...evmLines].join("\n");
  if (scope === "solana" && !balances.solanaReady) return [introLine, ...solanaLines].join("\n");
  return [introLine, ...evmLines, ...solanaLines].join("\n");
}

export async function requireLiveConfig(scope: LiveScope = "all"): Promise<LiveConfig> {
  const config = await loadLiveConfig();
  const balances = await getLiveBalanceStatus(config, scope);

  const needsEvm = scope === "evm" || scope === "all";
  const needsSolana = scope === "solana" || scope === "all";

  if ((needsEvm && !balances.evmReady) || (needsSolana && !balances.solanaReady)) {
    throw new Error(buildFundingMessage(config, scope, balances));
  }

  return config;
}

export async function runLiveEvmCLI(
  args: string[],
  config: LiveConfig,
  opts?: LiveRunOptions,
): Promise<RunCLIResult> {
  const sponsoredArgs =
    opts?.sponsored && config.evmGasPolicyId
      ? ["--gas-sponsored", "--gas-policy-id", config.evmGasPolicyId]
      : [];

  return runCLI(
    [
      "--json",
      "--no-interactive",
      "--api-key",
      config.apiKey,
      "--network",
      config.evmNetwork,
      ...sponsoredArgs,
      ...args,
    ],
    {
      ALCHEMY_CONFIG: createIsolatedConfigPath(),
      ALCHEMY_WALLET_KEY: config.evmPrivateKey,
    },
  );
}

export async function runLiveSolanaCLI(
  args: string[],
  config: LiveConfig,
  opts?: LiveRunOptions,
): Promise<RunCLIResult> {
  const sponsoredArgs =
    opts?.sponsored && config.solanaGasPolicyId
      ? ["--gas-sponsored", "--gas-policy-id", config.solanaGasPolicyId]
      : [];

  return runCLI(
    [
      "--json",
      "--no-interactive",
      "--api-key",
      config.apiKey,
      "--network",
      config.solanaNetwork,
      ...sponsoredArgs,
      ...args,
    ],
    {
      ALCHEMY_CONFIG: createIsolatedConfigPath(),
      ALCHEMY_SOLANA_WALLET_KEY: config.solanaPrivateKey,
    },
  );
}
