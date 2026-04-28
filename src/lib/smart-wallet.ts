import { createSmartWalletClient, alchemyWalletTransport } from "@alchemy/wallet-apis";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain, Address } from "viem";
import type { Command } from "commander";
import {
  resolveAPIKey,
  resolveAuthToken,
  resolveActiveSigner,
  resolveWalletSession,
  resolveWalletKey,
  resolveNetwork,
  resolveGasSponsored,
  resolveGasPolicyId,
} from "./resolve.js";
import { load as loadConfig, type Config } from "./config.js";
import { networkToChain } from "./chains.js";
import {
  errAuthRequired,
  errWalletKeyRequired,
  errInvalidArgs,
  errSessionExpired,
  errNoActiveSession,
} from "./errors.js";
import { createDelegatedAccount } from "./delegated-signer.js";
import { loadStoredSession, type WalletSession } from "./wallet-session.js";
import { dim } from "./ui.js";

function normalizeKey(key: string): `0x${string}` {
  const trimmed = key.trim();
  return (trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

export interface PaymasterConfig {
  policyId: string;
}

export interface WalletContext {
  client: ReturnType<typeof createSmartWalletClient>;
  network: string;
  chain: Chain;
  address: Address;
  paymaster: PaymasterConfig | undefined;
}

export interface BuildWalletClientOptions {
  signer?: "session" | "local";
}

// Process-lifetime flag: the dual-signer-configured notice should fire at most
// once per invocation so scripts that run multiple tx commands don't spam.
let dualConfigWarningShown = false;

function warnDualConfigOnce(): void {
  if (dualConfigWarningShown) return;
  dualConfigWarningShown = true;
  const prefix = dim("!");
  console.error(
    `  ${prefix} Both session and local signers are configured; using the session wallet. Run \`alchemy wallet use local\` to switch.`,
  );
}

/** Test-only: reset the one-shot warning flag between cases. */
export function resetDualConfigWarning(): void {
  dualConfigWarningShown = false;
}

function assertSessionMetadata(session: WalletSession): void {
  if (!session.envelopeVersion.trim()) {
    throw errInvalidArgs(
      "Wallet session is missing signer version metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.backendBaseUrl?.trim()) {
    throw errInvalidArgs(
      "Wallet session is missing backend metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.evmAddress) {
    throw errInvalidArgs(
      "Wallet session is missing EVM address metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.walletId && !session.evmWalletId) {
    throw errInvalidArgs(
      "Wallet session is missing wallet ID metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.privyKeyQuorumId && !session.privySignerId) {
    throw errInvalidArgs(
      "Wallet session is missing signer binding metadata. Run 'alchemy wallet connect --force'.",
    );
  }
}

export function buildWalletClient(
  program: Command,
  options: BuildWalletClientOptions = {},
): WalletContext {
  const apiKey = resolveAPIKey(program);
  if (!apiKey) throw errAuthRequired();

  const cfg: Config = loadConfig();
  const network = resolveNetwork(program, cfg);
  const chain = networkToChain(network);
  const gasSponsored = resolveGasSponsored(program, cfg);
  const gasPolicyId = resolveGasPolicyId(program, cfg);

  if (gasSponsored && !gasPolicyId) {
    throw errInvalidArgs(
      "Gas sponsorship requires a gas policy ID. Set one with --gas-policy-id or `alchemy config set gas-policy-id <id>`.",
    );
  }

  const validSession = resolveWalletSession();
  const storedSession = loadStoredSession();
  const localKey = resolveWalletKey(program, cfg);
  const explicitSigner = options.signer;
  const pref: "session" | "local" | undefined =
    explicitSigner ?? resolveActiveSigner(program, cfg);

  const chosen: "session" | "local" = pref ?? (validSession ? "session" : "local");

  const signerConfig = (() => {
    if (chosen === "session") {
      if (!validSession) {
        // Only treat this as "session was explicitly requested" when the user
        // has a preference. With no preference, expired sessions fall through
        // naturally above — but if we got here, `validSession` is null and we
        // have to choose between "expired" and "never connected" wording.
        if (pref === "session" && storedSession) {
          throw errSessionExpired();
        }
        throw errNoActiveSession();
      }
      assertSessionMetadata(validSession);
      if (validSession.chainType && validSession.chainType !== "evm") {
        throw errInvalidArgs(
          `Wallet session is configured for '${validSession.chainType}', not EVM. Run 'alchemy wallet connect --force'.`,
        );
      }
      const authToken = resolveAuthToken(cfg);
      if (!authToken) {
        throw errAuthRequired();
      }
      return {
        signer: createDelegatedAccount({
          authToken,
          session: validSession,
        }) as Parameters<typeof createSmartWalletClient>[0]["signer"],
        address: validSession.evmAddress as Address,
      };
    }

    if (!localKey) throw errWalletKeyRequired();
    const account = privateKeyToAccount(normalizeKey(localKey));
    return {
      signer: account as Parameters<typeof createSmartWalletClient>[0]["signer"],
      address: account.address as Address,
    };
  })();

  // Warn once when both signers are configured and the user has not expressed a
  // preference — they probably do not realize which one signed.
  if (!pref && validSession && localKey) {
    warnDualConfigOnce();
  }

  const paymaster = gasSponsored && gasPolicyId
    ? { policyId: gasPolicyId }
    : undefined;

  const client = createSmartWalletClient({
    transport: alchemyWalletTransport({ apiKey }),
    chain,
    signer: signerConfig.signer,
    paymaster,
  });

  return { client, network, chain, address: signerConfig.address, paymaster };
}
