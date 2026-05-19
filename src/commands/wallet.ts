import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import * as config from "../lib/config.js";
import { openBrowser } from "../lib/auth.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import {
  createRemoteWalletSessionRequest,
  disconnectRemoteWalletSession,
  getRemoteWalletSession,
  getRemoteWalletSessionRequest,
  getWalletApiBaseUrl,
  type WalletSessionStatusResponse,
} from "../lib/wallet-api.js";
import {
  resolveWalletKey,
  resolveSolanaWalletKey,
  resolveAuthToken,
  resolveWalletSession,
  resolveActiveSigner,
} from "../lib/resolve.js";
import { promptConfirm, promptSelect, promptText } from "../lib/terminal-ui.js";
import QRCode from "qrcode";
import { printHuman, isJSONMode, printJSON } from "../lib/output.js";
import {
  CLIError,
  ErrorCode,
  errAuthRequired,
  errInvalidArgs,
  errNoActiveSession,
  errSolanaWalletKeyRequired,
  errWalletKeyRequired,
  exitWithError,
} from "../lib/errors.js";
import { green, dim, printKeyValue } from "../lib/ui.js";
import {
  createPendingSession,
  loadSession,
  clearSession,
  isSessionValid,
  updateSession,
} from "../lib/wallet-session.js";
import * as walletSession from "../lib/wallet-session.js";

type WalletType = "evm" | "solana";
type WalletSource = "session" | "local";
const CONNECT_POLL_INTERVAL_MS = 2_000;
const CONNECT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_WALLET_CAPABILITIES = {
  "evm.signMessage": true,
  "evm.signTypedData": true,
  "evm.signAuthorization": true,
} as const;
const DEFAULT_SOLANA_SESSION_CAPABILITIES = {
  "solana.signTransaction": true,
} as const;

function createEvmWallet(): { privateKey: `0x${string}`; address: `0x${string}` } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, address: account.address };
}

function getEvmWalletAddress(privateKey: string): `0x${string}` {
  const normalized = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
  return privateKeyToAccount(normalized).address;
}

function parseSolanaSecretKey(secret: string): Uint8Array {
  const trimmed = secret.trim();

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw errInvalidArgs("Invalid Solana key file: expected JSON array or hex-encoded private key.");
    }

    if (!Array.isArray(parsed) || !parsed.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw errInvalidArgs("Invalid Solana key file: expected an array of byte values.");
    }

    return Uint8Array.from(parsed);
  }

  if (!/^[a-fA-F0-9]+$/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw errInvalidArgs("Invalid Solana key file: expected JSON array or hex-encoded private key.");
  }

  return Uint8Array.from(Buffer.from(trimmed, "hex"));
}

async function createSolanaWallet(): Promise<{ secretKey: string; address: string }> {
  // Kit's direct keypair generators return non-extractable private keys, so
  // we create an extractable signer from secure random bytes in order to
  // persist a standard Solana keypair file.
  const privateKeyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const signer = await createKeyPairSignerFromPrivateKeyBytes(privateKeyBytes, true);
  const publicKeyBytes = new Uint8Array(
    await globalThis.crypto.subtle.exportKey("raw", signer.keyPair.publicKey),
  );
  const secretKeyBytes = Uint8Array.from([...privateKeyBytes, ...publicKeyBytes]);

  return {
    secretKey: JSON.stringify(Array.from(secretKeyBytes)),
    address: signer.address,
  };
}

async function getSolanaWalletAddress(secretKey: string): Promise<string> {
  const keyBytes = parseSolanaSecretKey(secretKey);
  if (keyBytes.length === 64) {
    const signer = await createKeyPairSignerFromBytes(keyBytes);
    return signer.address;
  }
  if (keyBytes.length === 32) {
    const signer = await createKeyPairSignerFromPrivateKeyBytes(keyBytes);
    return signer.address;
  }
  throw errInvalidArgs("Invalid Solana key file: expected 64-byte secret key or 32-byte private key.");
}

const WALLET_KEYS_DIR = "wallet-keys";
const UUID_SLICE_LEN = 8;
const ADDRESS_SLICE_LEN = 12;
type WalletStatus = "active" | "expired" | "none";
type RemoteWalletStatus = Awaited<ReturnType<typeof getRemoteWalletSession>>["status"];

class WalletConnectInterruptedError extends Error {
  constructor() {
    super("Wallet connect cancelled.");
    this.name = "WalletConnectInterruptedError";
  }
}

function isWalletConnectInterruptedError(err: unknown): err is WalletConnectInterruptedError {
  return err instanceof WalletConnectInterruptedError;
}

function normalizeRemoteStatusForStorage(status: RemoteWalletStatus): "pending" | "approved" | "revoked" | "expired" {
  if (status === "denied") {
    return "revoked";
  }
  return status;
}

function createInterruptibleDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new WalletConnectInterruptedError());
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new WalletConnectInterruptedError());
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForInterruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new WalletConnectInterruptedError());
  }

  let onAbort!: () => void;
  const interrupt = new Promise<never>((_, reject) => {
    onAbort = () => reject(new WalletConnectInterruptedError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, interrupt]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function withApprovalInterruptHandler<T>(args: {
  authToken: string;
  sessionIds: string[];
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  const previousSigintListeners = process.listeners("SIGINT");
  let hasInterrupted = false;

  const onSigint = (): void => {
    if (hasInterrupted) {
      process.exit(130);
    }
    hasInterrupted = true;
    if (!isJSONMode()) {
      process.stderr.write(
        "\nWallet connect cancelled. Cleaning up... Press Ctrl-C again to force exit.\n",
      );
    }
    controller.abort();
  };

  // Temporarily own SIGINT during approval polling so the first Ctrl-C can
  // clean up wallet session state; restore existing handlers immediately after.
  process.removeAllListeners("SIGINT");
  process.on("SIGINT", onSigint);

  try {
    return await args.run(controller.signal);
  } catch (err) {
    if (isWalletConnectInterruptedError(err)) {
      await Promise.all(
        args.sessionIds.map((sessionId) =>
          disconnectRemoteWalletSession(args.authToken, sessionId).catch(
            () => undefined,
          ),
        ),
      );
      clearSession();
    }
    throw err;
  } finally {
    process.removeListener("SIGINT", onSigint);
    for (const listener of previousSigintListeners) {
      process.on("SIGINT", listener);
    }
  }
}

function deriveWalletStatus(
  session: walletSession.WalletSession | null,
): WalletStatus {
  if (!session) return "none";
  if (isSessionValid(session)) return "active";
  if (session.status === "pending") return "none";
  return "expired";
}

function resolveSessionAddress(session: walletSession.WalletSession | null): string | null {
  if (!session) return null;
  return session.evmAddress ?? session.solanaAddress ?? null;
}

function resolveSessionEnvironment(session: walletSession.WalletSession | null): string | null {
  if (!session) return null;
  if (session.backendBaseUrl) {
    try {
      const { hostname } = new URL(session.backendBaseUrl);
      return hostname;
    } catch {
      return session.backendBaseUrl;
    }
  }

  if (session.environment) {
    return session.environment.interactive ? "interactive" : "non-interactive";
  }

  return null;
}

function resolveEnabledCapabilities(
  session: walletSession.WalletSession | null,
): string[] {
  if (!session?.capabilities) {
    return [];
  }

  return Object.entries(session.capabilities)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));
}

function formatWalletStatus(value: WalletStatus): string {
  if (value === "active") return green("active");
  return dim(value);
}

function walletKeysDirPath(): string {
  return join(config.configDir(), WALLET_KEYS_DIR);
}

function walletKeyPath(prefix: string, address: string): string {
  const addr = address
    .trim()
    .toLowerCase()
    .replace(/^0x/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, ADDRESS_SLICE_LEN);
  const addressTag = addr || "unknown";
  const fileName = `${prefix}-${addressTag}-${Date.now()}-${randomUUID().slice(0, UUID_SLICE_LEN)}.txt`;
  return join(walletKeysDirPath(), fileName);
}

function persistWalletKey(prefix: string, privateKey: string, address: string): string {
  const keyPath = walletKeyPath(prefix, address);
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o755 });
  writeFileSync(keyPath, privateKey + "\n", { mode: 0o600, flag: "wx" });
  return keyPath;
}

function cleanupWalletKey(path: string | undefined): void {
  if (!path) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // Best-effort cleanup for partially created wallet files.
  }
}

async function resolveQrWalletType(
  program: Command,
  opts: { type?: string; solana?: boolean },
  available: { evm: boolean; solana: boolean },
): Promise<WalletType | null> {
  if (opts.solana && opts.type && opts.type !== "solana") {
    throw errInvalidArgs("Cannot combine --solana with --type evm.");
  }

  if (opts.type) {
    if (opts.type !== "evm" && opts.type !== "solana") {
      throw errInvalidArgs("wallet type must be 'evm' or 'solana'.");
    }
    return opts.type;
  }

  if (opts.solana) {
    return "solana";
  }

  if (isInteractiveAllowed(program)) {
    return promptSelect<WalletType>({
      message: "Select wallet for QR code",
      options: [
        {
          value: "evm",
          label: "EVM",
          hint: available.evm ? "Use configured EVM wallet" : "Not configured",
          disabled: !available.evm,
        },
        {
          value: "solana",
          label: "Solana",
          hint: available.solana ? "Use configured Solana wallet" : "Not configured",
          disabled: !available.solana,
        },
      ],
      initialValue: available.evm ? "evm" : "solana",
      cancelMessage: "Cancelled wallet QR selection.",
      commitLabel: null,
    });
  }

  return "evm";
}

function resolveQrAddress(args: {
  preferredSource: "session" | "local" | null;
  sessionAddress: string | null;
  localAddress: string | null;
}): { address: string; source: WalletSource } | null {
  if (args.preferredSource === "session") {
    return args.sessionAddress
      ? { address: args.sessionAddress, source: "session" }
      : null;
  }

  if (args.preferredSource === "local") {
    return args.localAddress
      ? { address: args.localAddress, source: "local" }
      : null;
  }

  if (args.sessionAddress) {
    return { address: args.sessionAddress, source: "session" };
  }

  if (args.localAddress) {
    return { address: args.localAddress, source: "local" };
  }

  return null;
}

function missingQrWalletError(type: WalletType, source: WalletSource | null): Error {
  if (source === "session") {
    return type === "solana"
      ? errInvalidArgs(
          "No Solana session wallet is configured. Run `alchemy wallet connect --mode session --force`.",
        )
      : errNoActiveSession();
  }

  if (source === "local") {
    return type === "solana" ? errSolanaWalletKeyRequired() : errWalletKeyRequired();
  }

  return errInvalidArgs(`No ${type === "solana" ? "Solana" : "EVM"} wallet is configured.`);
}

function indentBlock(text: string, prefix = "  "): string {
  return text
    .split("\n")
    .map((line) => line ? `${prefix}${line}` : line)
    .join("\n");
}

export function generateAndPersistWallet(): { address: string; keyFile: string } {
  const wallet = createEvmWallet();
  const keyPath = persistWalletKey("wallet-key", wallet.privateKey, wallet.address);

  const cfg = config.load();
  config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: wallet.address });
  return { address: wallet.address, keyFile: keyPath };
}

export async function generateAndPersistSolanaWallet(): Promise<{ address: string; keyFile: string }> {
  const wallet = await createSolanaWallet();
  const keyPath = persistWalletKey("solana-wallet-key", wallet.secretKey, wallet.address);

  const cfg = config.load();
  config.save({ ...cfg, solana_wallet_key_file: keyPath, solana_wallet_address: wallet.address });
  return { address: wallet.address, keyFile: keyPath };
}

async function createAndPersistWallets(): Promise<{
  evm: { address: string; keyFile: string };
  solana: { address: string; keyFile: string };
}> {
  const evm = createEvmWallet();
  const solana = await createSolanaWallet();

  let evmKeyPath: string | undefined;
  let solanaKeyPath: string | undefined;

  try {
    evmKeyPath = persistWalletKey("wallet-key", evm.privateKey, evm.address);
    solanaKeyPath = persistWalletKey("solana-wallet-key", solana.secretKey, solana.address);

    const cfg = config.load();
    config.save({
      ...cfg,
      wallet_key_file: evmKeyPath,
      wallet_address: evm.address,
      solana_wallet_key_file: solanaKeyPath,
      solana_wallet_address: solana.address,
    });

    return {
      evm: { address: evm.address, keyFile: evmKeyPath },
      solana: { address: solana.address, keyFile: solanaKeyPath },
    };
  } catch (err) {
    cleanupWalletKey(solanaKeyPath);
    cleanupWalletKey(evmKeyPath);
    throw err;
  }
}

export function importAndPersistWallet(path: string): { address: string; keyFile: string } {
  let key: string;
  try {
    key = readFileSync(path, "utf-8").trim();
  } catch {
    throw errInvalidArgs(`Could not read key file: ${path}`);
  }

  const address = getEvmWalletAddress(key);
  const keyPath = persistWalletKey("wallet-key", key, address);

  const cfg = config.load();
  config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: address });
  return { address, keyFile: keyPath };
}

type LocalChain = "evm" | "both";

function hasValidSessionWithEvm(): boolean {
  const session = resolveWalletSession();
  return Boolean(session && session.evmAddress);
}

function hasLocalEvmKey(): boolean {
  const cfg = config.load();
  return Boolean(cfg.wallet_key_file);
}

function hasLocalSolanaKey(): boolean {
  const cfg = config.load();
  return Boolean(cfg.solana_wallet_key_file);
}

function computeActiveSignerForStatus(
  program: Command,
  cfg: config.Config,
  hasEffectiveLocalEvm: boolean,
): "session" | "local" | null {
  const preferredSigner = typeof resolveActiveSigner === "function"
    ? resolveActiveSigner(program, cfg)
    : undefined;
  if (preferredSigner) return preferredSigner;
  // No explicit preference: default policy mirrors buildWalletClient —
  // session if a valid session exists, else local if a key exists, else null.
  if (hasValidSessionWithEvm()) return "session";
  if (hasEffectiveLocalEvm) return "local";
  return null;
}

function getEffectiveLocalWalletState(
  program: Command,
  cfg: config.Config,
): {
  evmAddress: string | null;
  evmKeyFile: string | null;
  solanaKeyFile: string | null;
} {
  const evmKey = resolveWalletKey(program, cfg);

  return {
    evmAddress: evmKey ? getEvmWalletAddress(evmKey) : null,
    evmKeyFile: cfg.wallet_key_file ?? null,
    solanaKeyFile: cfg.solana_wallet_key_file ?? null,
  };
}

async function runLocalCreate(opts: {
  force: boolean;
  program: Command;
}): Promise<{ evm: { address: string; keyFile: string }; solana: { address: string; keyFile: string } }> {
  const cfg = config.load();

  const evmConflict = Boolean(cfg.wallet_key_file);
  const solanaConflict = Boolean(cfg.solana_wallet_key_file);

  if ((evmConflict || solanaConflict) && !opts.force) {
    if (!isInteractiveAllowed(opts.program)) {
      throw errInvalidArgs(
        "A local key is already configured. Re-run with --force to replace it.",
      );
    }
    const kinds = [evmConflict ? "EVM" : null, solanaConflict ? "Solana" : null].filter(Boolean).join(" and ");
    const replace = await promptConfirm({
      message: `Replace the existing local ${kinds} key?`,
      cancelMessage: "Wallet connect cancelled.",
      initialValue: false,
    });
    if (replace !== true) {
      throw errInvalidArgs("Aborted. Existing local key preserved.");
    }
  }

  return await createAndPersistWallets();
}

function runLocalImport(opts: { path: string; program: Command; force: boolean }): { evm: { address: string; keyFile: string } } {
  const cfg = config.load();
  if (cfg.wallet_key_file && !opts.force) {
    if (!isInteractiveAllowed(opts.program)) {
      throw errInvalidArgs(
        "A local EVM key is already configured. Re-run with --force to replace it.",
      );
    }
    // promptConfirm is async, but this function must stay synchronous for the
    // existing test paths. Fallthrough to async wrapper below.
    throw new ImportNeedsPromptError();
  }
  const evm = importAndPersistWallet(opts.path);
  return { evm };
}

// Sentinel error for the sync/async split above; caught by the async wrapper
// that wraps runLocalImport and prompts before retrying with --force.
class ImportNeedsPromptError extends Error {}

async function runLocalImportInteractive(opts: { path: string; program: Command; force: boolean }): Promise<{ evm: { address: string; keyFile: string } }> {
  try {
    return runLocalImport(opts);
  } catch (err) {
    if (!(err instanceof ImportNeedsPromptError)) throw err;
    const replace = await promptConfirm({
      message: "Replace the existing local EVM key?",
      cancelMessage: "Wallet import cancelled.",
      initialValue: false,
    });
    if (replace !== true) {
      throw errInvalidArgs("Aborted. Existing local EVM key preserved.");
    }
    return runLocalImport({ ...opts, force: true });
  }
}

function capabilitiesForChain(chain: "evm" | "solana"): Record<string, boolean> {
  return chain === "evm"
    ? { ...DEFAULT_WALLET_CAPABILITIES }
    : { ...DEFAULT_SOLANA_SESSION_CAPABILITIES };
}

function capabilitiesForChains(
  chains: Array<"evm" | "solana">,
): Record<string, Record<string, boolean>> {
  return Object.fromEntries(
    chains.map((chain) => [chain, capabilitiesForChain(chain)]),
  );
}

function getApprovedSessionWalletMetadata(
  chain: "evm" | "solana",
  session: WalletSessionStatusResponse,
): { walletId: string; walletAddress: string } {
  const walletId = chain === "evm"
    ? session.walletId ?? session.evmWalletId
    : session.solanaWalletId ?? session.walletId;
  const walletAddress = chain === "evm"
    ? session.evmAddress ?? session.address
    : session.solanaAddress ?? session.address;

  if (!walletId || !walletAddress) {
    throw new CLIError(
      ErrorCode.INTERNAL_ERROR,
      "Approved wallet session response missing required metadata.",
    );
  }
  return { walletId, walletAddress };
}

async function runSessionConnect(opts: {
  program: Command;
  force: boolean;
  instanceName?: string;
}): Promise<void> {
  const requestedChains: Array<"evm" | "solana"> = ["evm", "solana"];
  const authToken = resolveAuthToken();
  if (!authToken) throw errAuthRequired();

  const existing = loadSession();
  if (existing) {
    if (!opts.force) {
      if (!isInteractiveAllowed(opts.program)) {
        throw errInvalidArgs("A wallet session already exists. Re-run with --force to replace it.");
      }
      const replace = await promptConfirm({
        message: "Replace the existing wallet session?",
        cancelMessage: "Wallet connect cancelled.",
      });
      if (replace === null) throw new WalletConnectInterruptedError();
      if (!replace) return;
    }
    clearSession();
  }

  const session = createPendingSession();
  let clientInstance: config.WalletClientInstance;
  try {
    clientInstance = config.getOrCreateWalletClientInstance({
      instanceName: opts.instanceName,
    });
  } catch {
    throw errInvalidArgs(
      "`--instance-name` must be 1-64 characters and cannot contain control characters.",
    );
  }
  const sessionEnvironment = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    interactive: isInteractiveAllowed(opts.program),
    clientInstanceId: clientInstance.id,
    ...(clientInstance.name === undefined ? {} : { clientInstanceName: clientInstance.name }),
  };
  updateSession({
    chainType: "both",
    capabilities: Object.assign(
      {},
      ...requestedChains.map((chain) => capabilitiesForChain(chain)),
    ),
    backendBaseUrl: getWalletApiBaseUrl(),
    environment: sessionEnvironment,
  });

  const remoteRequest = await createRemoteWalletSessionRequest(authToken, {
        publicKeyJwk: session.publicKeyJwk,
        requestSignerVersion: session.envelopeVersion,
        chains: requestedChains,
        capabilities: capabilitiesForChains(requestedChains),
        environment: sessionEnvironment,
      }).catch((err) => {
        clearSession();
        throw err;
      });

  const pendingSessionsByChain = Object.fromEntries(
    remoteRequest.sessions.map((remoteSession) => [
      remoteSession.chainType,
      {
        sessionId: remoteSession.walletSessionId,
        status: "pending" as const,
        expiresAt: remoteRequest.expiresAt ?? session.expiresAt,
        chainType: remoteSession.chainType as "evm" | "solana",
        capabilities: capabilitiesForChain(
          remoteSession.chainType as "evm" | "solana",
        ),
      },
    ]),
  ) as Partial<Record<"evm" | "solana", walletSession.ChainWalletSession>>;

  updateSession({
    connectionRequestId: remoteRequest.sessionId,
    sessionId: remoteRequest.sessions[0].walletSessionId,
    expiresAt: remoteRequest.expiresAt ?? session.expiresAt,
    sessionsByChain: pendingSessionsByChain,
  });

  if (!isJSONMode()) {
    const summaryPairs: Array<[string, string]> = [
      ["Connection Request ID", remoteRequest.sessionId],
      ["Status", "pending"],
      ["Approval URL", remoteRequest.approvalUrl],
      ["Created", session.createdAt],
      ["Expires", remoteRequest.expiresAt ?? session.expiresAt],
    ];
    if (clientInstance.name !== undefined) {
      summaryPairs.splice(1, 0, ["Instance", clientInstance.name]);
    }
    printKeyValue(summaryPairs);
    console.log(`  ${green("✓")} Wallet session created`);
  }

  if (!isJSONMode() && isInteractiveAllowed(opts.program)) {
    const answer = await promptText({
      message: "Press Enter to open browser and approve your wallet session",
      cancelMessage: "Wallet connect cancelled.",
    });
    if (answer === null) {
      clearSession();
      await Promise.all(
        remoteRequest.sessions.map((remoteSession) =>
          disconnectRemoteWalletSession(
            authToken,
            remoteSession.walletSessionId,
          ).catch(() => undefined),
        ),
      );
      throw new WalletConnectInterruptedError();
    }
  }

  if (!isJSONMode()) {
    console.log(`  Opening browser for approval...`);
    console.log(`  ${dim("Waiting for dashboard approval to complete connection.")}`);
  }

  openBrowser(remoteRequest.approvalUrl);

  const approvedSessions = await withApprovalInterruptHandler({
    authToken,
    sessionIds: remoteRequest.sessions.map(
      (remoteSession) => remoteSession.walletSessionId,
    ),
    run: async (signal) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < CONNECT_TIMEOUT_MS) {
        const currentSessions = await waitForInterruptible(
          remoteRequest.sessionId
            ? getRemoteWalletSessionRequest(
                authToken,
                remoteRequest.sessionId,
              ).then((request) => request.sessions)
            : Promise.all(
                remoteRequest.sessions.map((remoteSession) =>
                  getRemoteWalletSession(authToken, remoteSession.walletSessionId),
                ),
              ),
          signal,
        );
        if (
          requestedChains.every((chain) =>
            currentSessions.some((current) => {
              return current.chainType === chain && current.status === "approved";
            }),
          )
        ) {
          return currentSessions;
        }
        const terminalSession = currentSessions.find((current) => {
          return current.status === "denied" ||
            current.status === "revoked" ||
            current.status === "expired";
        });
        if (terminalSession) {
          clearSession();
          throw new CLIError(
            ErrorCode.INTERNAL_ERROR,
            `Wallet session ${terminalSession.status}.`,
            "Run 'alchemy wallet connect' to start a new approval flow.",
          );
        }
        await createInterruptibleDelay(CONNECT_POLL_INTERVAL_MS, signal);
      }

      return null;
    },
  });

  if (!approvedSessions) {
    throw new CLIError(
      ErrorCode.NETWORK_ERROR,
      "Timed out waiting for wallet approval.",
      "Finish approval in the dashboard and rerun 'alchemy wallet connect --force' if needed.",
    );
  }

  const missingProviderAppId = approvedSessions.find((approvedSession) => {
    return !approvedSession.privyAppId;
  });
  if (missingProviderAppId) {
    throw new CLIError(
      ErrorCode.INTERNAL_ERROR,
      "Approved wallet session response missing required metadata.",
    );
  }

  const approvedSessionsByChain = Object.fromEntries(
    requestedChains.map((chain) => {
      const approvedSession = approvedSessions.find((current) => {
        return current.chainType === chain;
      });
      if (!approvedSession) {
        throw new CLIError(
          ErrorCode.INTERNAL_ERROR,
          "Approved wallet session response missing requested chain.",
        );
      }
      const { walletId, walletAddress } = getApprovedSessionWalletMetadata(
        chain,
        approvedSession,
      );
      return [
        chain,
        {
          sessionId: approvedSession.sessionId ??
            remoteRequest.sessions.find((remoteSession) => remoteSession.chainType === chain)?.walletSessionId ??
            session.sessionId,
          status: "approved" as const,
          expiresAt: approvedSession.expiresAt ?? remoteRequest.expiresAt ?? session.expiresAt,
          chainType: chain,
          walletId,
          walletAddress,
          providerKeyQuorumId: approvedSession.privyKeyQuorumId,
          providerSignerId: approvedSession.privySignerId,
          capabilities: approvedSession.capabilities ?? capabilitiesForChain(chain),
        },
      ];
    }),
  ) as Partial<Record<"evm" | "solana", walletSession.ChainWalletSession>>;
  const firstApprovedSession = approvedSessions.find((approvedSession) => {
    return approvedSession.chainType === requestedChains[0];
  }) ?? approvedSessions[0];
  const evmSession = approvedSessionsByChain.evm;
  const solanaSession = approvedSessionsByChain.solana;

  updateSession({
    connectionRequestId: remoteRequest.sessionId,
    sessionId: firstApprovedSession.sessionId ?? remoteRequest.sessions[0].walletSessionId,
    status: "approved",
    expiresAt: firstApprovedSession.expiresAt ?? remoteRequest.expiresAt ?? session.expiresAt,
    privyAppId: firstApprovedSession.privyAppId,
    walletId: evmSession?.walletId ?? solanaSession?.walletId,
    evmWalletId: evmSession?.walletId,
    evmAddress: evmSession?.walletAddress,
    solanaWalletId: solanaSession?.walletId,
    solanaAddress: solanaSession?.walletAddress,
    privyKeyQuorumId:
      evmSession?.providerKeyQuorumId ?? solanaSession?.providerKeyQuorumId,
    privySignerId:
      evmSession?.providerSignerId ?? solanaSession?.providerSignerId,
    chainType: "both",
    capabilities: Object.assign(
      {},
      ...requestedChains.map((chain) => capabilitiesForChain(chain)),
      ...approvedSessions.map((approvedSession) => approvedSession.capabilities ?? {}),
    ),
    sessionsByChain: approvedSessionsByChain,
    backendBaseUrl: getWalletApiBaseUrl(),
    environment: sessionEnvironment,
  });

  if (isJSONMode()) {
    printJSON({
      connectionRequestId: remoteRequest.sessionId,
      sessionId:
        firstApprovedSession.sessionId ?? remoteRequest.sessions[0].walletSessionId,
      walletSessionId:
        firstApprovedSession.sessionId ?? remoteRequest.sessions[0].walletSessionId,
      status: "approved",
      privyAppId: firstApprovedSession.privyAppId,
      walletId: evmSession?.walletId ?? solanaSession?.walletId,
      ...(evmSession
        ? {
            evmAddress: evmSession.walletAddress,
            evmWalletId: evmSession.walletId,
          }
        : {}),
      ...(solanaSession
        ? {
            solanaAddress: solanaSession.walletAddress,
            solanaWalletId: solanaSession.walletId,
          }
        : {}),
      chainType: "both",
      capabilities: Object.assign(
        {},
        ...requestedChains.map((chain) => capabilitiesForChain(chain)),
      ),
      expiresAt: firstApprovedSession.expiresAt ?? remoteRequest.expiresAt ?? session.expiresAt,
      sessionsByChain: approvedSessionsByChain,
    });
  } else {
    const pairs: [string, string][] = [
      ["Connection Request ID", remoteRequest.sessionId],
      ["Status", green("approved")],
    ];
    for (const chain of requestedChains) {
      const chainSession = approvedSessionsByChain[chain];
      if (!chainSession) continue;
      pairs.push(
        [`${chain.toUpperCase()} Wallet ID`, chainSession.walletId ?? ""],
        [`${chain.toUpperCase()} Address`, green(chainSession.walletAddress ?? "")],
      );
    }
    pairs.push([
      "Expires",
      firstApprovedSession.expiresAt ?? remoteRequest.expiresAt ?? session.expiresAt,
    ]);
    printKeyValue(pairs);
    console.log(`  ${green("✓")} Wallet connected`);
  }
}

function printPostLocalCreateSummary(
  result: { evm?: { address: string; keyFile: string }; solana?: { address: string; keyFile: string } },
): void {
  if (isJSONMode()) {
    printJSON({ mode: "local", ...result });
    return;
  }
  const pairs: [string, string][] = [];
  if (result.evm) {
    pairs.push(["EVM Address", green(result.evm.address)]);
    pairs.push(["EVM Key file", result.evm.keyFile]);
  }
  if (result.solana) {
    pairs.push(["Solana Address", green(result.solana.address)]);
    pairs.push(["Solana Key file", result.solana.keyFile]);
  }
  printKeyValue(pairs);
  console.log(`  ${green("✓")} Local wallet configured`);
}

function printPostLocalImportSummary(result: { evm: { address: string; keyFile: string } }): void {
  if (isJSONMode()) {
    printJSON({ mode: "local", evm: result.evm });
    return;
  }
  printKeyValue([
    ["Address", green(result.evm.address)],
    ["Key file", result.evm.keyFile],
  ]);
  console.log(`  ${green("✓")} Local wallet imported`);
}

function printCrossModeHintAfterSessionConnect(): void {
  if (isJSONMode()) return;
  if (hasLocalEvmKey()) {
    console.log(
      `  ${dim("Your local signer is still configured. Run")} alchemy wallet use local ${dim("to switch.")}`,
    );
  }
}

function printCrossModeHintAfterLocal(chain: LocalChain): void {
  if (isJSONMode()) return;
  // active_signer is EVM-scoped: only suggest `wallet use session` when the
  // user has an EVM-capable session AND just created something that could
  // compete with it (i.e. the EVM side).
  if ((chain === "evm" || chain === "both") && hasValidSessionWithEvm()) {
    console.log(
      `  ${dim("Your session signer is still configured. Run")} alchemy wallet use local ${dim("to switch.")}`,
    );
  }
}

async function runConnectFlow(
  program: Command,
  opts: {
    mode?: string;
    import?: string;
    force?: boolean;
    instanceName?: string;
  },
): Promise<void> {
  // Validate flag coherence.
  const force = Boolean(opts.force);
  const importPath = opts.import;
  let mode: "session" | "local" | undefined;

  if (opts.mode === "session" || opts.mode === "local") {
    mode = opts.mode;
  } else if (opts.mode !== undefined) {
    throw errInvalidArgs("`--mode` must be 'session' or 'local'.");
  }

  if (opts.instanceName !== undefined) {
    if (mode === "local") {
      throw errInvalidArgs("`--instance-name` is only valid with `--mode session`.");
    }
    mode = "session";
  }

  if (importPath) {
    if (mode === "session") {
      throw errInvalidArgs("`--import` is only valid with `--mode local`.");
    }
    mode = "local";
  }

  // Prompt for mode if unset and interactive.
  if (!mode) {
    if (!isInteractiveAllowed(program)) {
      throw errInvalidArgs(
        "Specify `--mode <session|local>` in non-interactive mode.",
      );
    }
    const choice = await promptSelect<"session" | "local">({
      message: "Choose a wallet to connect",
      options: [
        { value: "session", label: "Session wallet", hint: "Recommended — Alchemy-managed, more secure" },
        { value: "local", label: "Local wallet", hint: "Private key stored on this machine" },
      ],
      initialValue: "session",
      cancelMessage: "Wallet connect cancelled.",
    });
    if (choice === null) throw new WalletConnectInterruptedError();
    mode = choice;
  }

  if (mode === "session") {
    await runSessionConnect({
      program,
      force,
      instanceName: opts.instanceName,
    });
    printCrossModeHintAfterSessionConnect();
    return;
  }

  // Local path.
  if (importPath) {
    const result = await runLocalImportInteractive({ path: importPath, program, force });
    printPostLocalImportSummary(result);
    printCrossModeHintAfterLocal("evm");
    return;
  }

  const result = await runLocalCreate({ force, program });
  printPostLocalCreateSummary(result);
  printCrossModeHintAfterLocal("both");
}

interface SessionSnapshot {
  session: walletSession.WalletSession | null;
  remoteStatus: RemoteWalletStatus | null;
  status: WalletStatus;
  walletAddress: string | null;
  environment: string | null;
  signerCapabilities: string[];
  walletId: string | null;
  expiresAt: string | null;
  sessionId: string | null;
  connectionRequestId: string | null;
  sessionState: walletSession.WalletSession["status"] | null;
  chainType: string | null;
  sessionsByChain: walletSession.WalletSession["sessionsByChain"] | null;
  valid: boolean;
}

function uniqueSessionIds(session: walletSession.WalletSession): string[] {
  const ids = Object.values(session.sessionsByChain ?? {})
    .map((chainSession) => chainSession?.sessionId)
    .filter((sessionId): sessionId is string => Boolean(sessionId));

  if (ids.length === 0) {
    ids.push(session.sessionId);
  }

  return Array.from(new Set(ids));
}

function selectRemoteSessionForStatus(
  session: walletSession.WalletSession,
  remoteSessions: WalletSessionStatusResponse[],
): WalletSessionStatusResponse {
  return remoteSessions.find((remoteSession) => {
    return remoteSession.status !== "approved";
  }) ?? remoteSessions.find((remoteSession) => {
    return remoteSession.sessionId === session.sessionId;
  }) ?? remoteSessions[0];
}

function mergeRemoteCapabilities(
  session: walletSession.WalletSession,
  remoteSessions: WalletSessionStatusResponse[],
): walletSession.WalletSession["capabilities"] {
  return Object.assign(
    {},
    session.capabilities ?? {},
    ...remoteSessions.map((remoteSession) => remoteSession.capabilities ?? {}),
  );
}

async function getRemoteSessionsForStatus(
  authToken: string,
  session: walletSession.WalletSession,
): Promise<WalletSessionStatusResponse[]> {
  const sessionIds = uniqueSessionIds(session);
  if (session.connectionRequestId) {
    try {
      return await getRemoteWalletSessionRequest(
        authToken,
        session.connectionRequestId,
      ).then((request) => request.sessions);
    } catch {
      // Fall back to the stored child IDs when the grouped request lookup is
      // unavailable; status should be best-effort across independent chains.
    }
  }

  const results = await Promise.allSettled(
    sessionIds.map((sessionId) => getRemoteWalletSession(authToken, sessionId)),
  );
  const remoteSessions = results.flatMap((result) => {
    return result.status === "fulfilled" ? [result.value] : [];
  });
  if (remoteSessions.length === 0) {
    const firstRejection = results.find((result) => {
      return result.status === "rejected";
    });
    throw firstRejection?.reason ?? new Error("Unable to verify wallet session.");
  }
  return remoteSessions;
}

async function buildSessionSnapshot(
  program: Command,
  verify: boolean,
): Promise<SessionSnapshot> {
  let session = walletSession.loadStoredSession?.() ?? loadSession();
  let remoteStatus: RemoteWalletStatus | null = null;

  if (verify && session) {
    const authToken = resolveAuthToken();
    if (!authToken) throw errAuthRequired();

    const remoteSessions = await getRemoteSessionsForStatus(authToken, session);
    const remote = selectRemoteSessionForStatus(session, remoteSessions);
    remoteStatus = remote.status;
    const nextSessionsByChain = { ...(session.sessionsByChain ?? {}) };
    for (const remoteSession of remoteSessions) {
      const chain = remoteSession.chainType === "solana" ? "solana" : "evm";
      const walletIdForChain = chain === "solana"
        ? remoteSession.solanaWalletId ?? remoteSession.walletId
        : remoteSession.evmWalletId ?? remoteSession.walletId;
      const walletAddressForChain = chain === "solana"
        ? remoteSession.solanaAddress ?? remoteSession.address
        : remoteSession.evmAddress ?? remoteSession.address;
      nextSessionsByChain[chain] = {
        ...(nextSessionsByChain[chain] ?? {}),
        sessionId: remoteSession.sessionId ?? nextSessionsByChain[chain]?.sessionId ?? session.sessionId,
        status: normalizeRemoteStatusForStorage(remoteSession.status),
        expiresAt: remoteSession.expiresAt ?? nextSessionsByChain[chain]?.expiresAt ?? session.expiresAt,
        chainType: chain,
        ...(walletIdForChain ? { walletId: walletIdForChain } : {}),
        ...(walletAddressForChain ? { walletAddress: walletAddressForChain } : {}),
        ...(remoteSession.privyKeyQuorumId
          ? { providerKeyQuorumId: remoteSession.privyKeyQuorumId }
          : {}),
        ...(remoteSession.privySignerId
          ? { providerSignerId: remoteSession.privySignerId }
          : {}),
        ...(remoteSession.capabilities ? { capabilities: remoteSession.capabilities } : {}),
      };
    }
    const remoteChain = remote.chainType === "solana" ? "solana" : "evm";
    const remoteWalletId = remoteChain === "solana"
      ? remote.solanaWalletId ?? remote.walletId
      : remote.evmWalletId ?? remote.walletId;
    const evmWalletId = remoteChain === "evm"
      ? remoteWalletId ?? session.evmWalletId
      : session.evmWalletId;
    const evmAddress = remoteChain === "evm"
      ? remote.evmAddress ?? remote.address ?? session.evmAddress
      : session.evmAddress;
    const solanaWalletId = remoteChain === "solana"
      ? remoteWalletId ?? session.solanaWalletId
      : session.solanaWalletId;
    const solanaAddress = remoteChain === "solana"
      ? remote.solanaAddress ?? remote.address ?? session.solanaAddress
      : session.solanaAddress;
    const chainType = nextSessionsByChain.evm && nextSessionsByChain.solana
      ? "both"
      : remote.chainType ?? session.chainType;

    session = {
      ...session,
      status: normalizeRemoteStatusForStorage(remote.status),
      expiresAt: remote.expiresAt ?? session.expiresAt,
      privyAppId: remote.privyAppId ?? session.privyAppId,
      walletId: evmWalletId ?? solanaWalletId ?? session.walletId,
      evmWalletId,
      evmAddress,
      solanaWalletId,
      solanaAddress,
      chainType,
      capabilities: mergeRemoteCapabilities(session, remoteSessions),
      sessionsByChain: nextSessionsByChain,
    };
    walletSession.saveSession(session);
  }

  const status = deriveWalletStatus(session);
  const walletAddress = resolveSessionAddress(session);
  const environment = resolveSessionEnvironment(session);
  const signerCapabilities = resolveEnabledCapabilities(session);
  const walletId = session?.walletId ?? session?.evmWalletId ?? null;
  const expiresAt = session?.expiresAt ?? null;

  return {
    session,
    remoteStatus,
    status,
    walletAddress,
    environment,
    signerCapabilities,
    walletId,
    expiresAt,
    sessionId: session?.sessionId ?? null,
    connectionRequestId: session?.connectionRequestId ?? null,
    sessionState: session?.status ?? null,
    chainType: session?.chainType ?? null,
    sessionsByChain: session?.sessionsByChain ?? null,
    valid: session ? isSessionValid(session) : false,
  };
}

export function registerWallets(program: Command) {
  const cmd = program.command("wallet").description("Manage wallets");

  // `alchemy wallet connect` is the single entry point.
  cmd
    .command("connect")
    .description("Connect a wallet for onchain actions (session or local)")
    .option("--mode <mode>", "session | local")
    .option("--import <path>", "For --mode local: import an EVM key from file instead of creating both wallets")
    .option("--instance-name <name>", "For --mode session: name this CLI instance")
    .option("--force", "Replace the existing signer")
    .action(async (opts: {
      mode?: string;
      import?: string;
      instanceName?: string;
      force?: boolean;
    }) => {
      try {
        await runConnectFlow(program, opts);
      } catch (err) {
        if (isWalletConnectInterruptedError(err)) {
          process.exit(130);
        }
        exitWithError(err);
      }
    });

  cmd
    .command("status")
    .option("--verify", "Verify session status with backend")
    .description("Show wallet status: session, local EVM, local Solana, active signer")
    .action(async (opts: { verify?: boolean }) => {
      try {
        const snap = await buildSessionSnapshot(program, Boolean(opts.verify));
        const cfg = config.load();
        const localState = getEffectiveLocalWalletState(program, cfg);
        const localSolanaKey = resolveSolanaWalletKey(program, cfg);
        const localSolanaAddress = localSolanaKey
          ? await getSolanaWalletAddress(localSolanaKey)
          : null;
        const activeSigner = computeActiveSignerForStatus(
          program,
          cfg,
          Boolean(localState.evmAddress),
        );

        if (isJSONMode()) {
          printJSON({
            // Preserved top-level fields (session-scoped, backward-compatible).
            walletAddress: snap.walletAddress,
            status: snap.status,
            expiresAt: snap.expiresAt,
            environment: snap.environment,
            signerCapabilities: snap.signerCapabilities,
            connectionRequestId: snap.connectionRequestId,
            sessionId: snap.sessionId,
            sessionState: snap.sessionState,
            walletId: snap.walletId,
            chainType: snap.chainType,
            sessionsByChain: snap.sessionsByChain,
            verified: Boolean(opts.verify),
            remoteStatus: snap.remoteStatus,
            valid: snap.valid,
            // New nested shape.
            session: {
              address: snap.walletAddress,
              status: snap.status,
              expiresAt: snap.expiresAt,
              environment: snap.environment,
              signerCapabilities: snap.signerCapabilities,
              connectionRequestId: snap.connectionRequestId,
              sessionId: snap.sessionId,
              sessionState: snap.sessionState,
              walletId: snap.walletId,
              chainType: snap.chainType,
              sessionsByChain: snap.sessionsByChain,
              valid: snap.valid,
            },
            localEvm: localState.evmAddress
              ? { address: localState.evmAddress, keyFile: localState.evmKeyFile }
              : null,
            localSolana: localSolanaAddress
              ? { address: localSolanaAddress, keyFile: localState.solanaKeyFile }
              : null,
            activeSigner,
          });
          return;
        }

        const pairs: [string, string][] = [
          ["Active Signer", activeSigner ? green(activeSigner) : dim("none")],
          ["Session", snap.walletAddress
            ? `${formatWalletStatus(snap.status)} (${snap.walletAddress})`
            : dim("not connected")],
          ["Session Expiry", snap.expiresAt ?? dim("none")],
          ["Local EVM", localState.evmAddress ?? dim("not configured")],
          ["Local Solana", localSolanaAddress ?? dim("not configured")],
          ["Environment", snap.environment ?? dim("none")],
          ["Signer Capabilities", snap.signerCapabilities.length > 0 ? snap.signerCapabilities.join(", ") : dim("none")],
        ];
        if (snap.connectionRequestId) {
          pairs.push(["Connection Request ID", snap.connectionRequestId]);
        } else if (snap.sessionId) {
          pairs.push(["Session ID", snap.sessionId]);
        }
        if (snap.walletId) pairs.push(["Wallet ID", snap.walletId]);
        if (opts.verify) {
          pairs.push(["Backend Status", snap.remoteStatus ?? dim("not checked")]);
        }

        printKeyValue(pairs);

        if (activeSigner === null) {
          console.log(
            `  ${dim("No wallet configured. Run")} alchemy wallet connect ${dim("to get started.")}`,
          );
        } else if (activeSigner === "session" && snap.status !== "active") {
          console.log(
            `  ${dim("Wallet session is not active. Run")} alchemy wallet connect --force ${dim("to reconnect.")}`,
          );
        } else if (activeSigner === "session") {
          console.log(`  ${green("✓")} Wallet session active`);
        } else {
          console.log(`  ${green("✓")} Local wallet active`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("address")
    .description("Display configured wallet addresses (session + local)")
    .action(async () => {
      try {
        const cfg = config.load();
        const session = resolveWalletSession();
        const sessionEvm = session?.evmAddress ?? null;
        const sessionSolana = session?.solanaAddress ?? null;
        const localState = getEffectiveLocalWalletState(program, cfg);
        const localSolanaKey = resolveSolanaWalletKey(program, cfg);
        const localSolanaAddress = localSolanaKey
          ? await getSolanaWalletAddress(localSolanaKey)
          : undefined;

        if (!localState.evmAddress && !localSolanaAddress && !sessionEvm && !sessionSolana) {
          throw errWalletKeyRequired();
        }

        const activeSigner = computeActiveSignerForStatus(
          program,
          cfg,
          Boolean(localState.evmAddress),
        );

        if (isJSONMode()) {
          printJSON({
            evm: localState.evmAddress ?? null,
            solana: localSolanaAddress ?? null,
            session: {
              evm: sessionEvm,
              solana: sessionSolana,
            },
            activeSigner,
          });
        } else {
          const pairs: [string, string][] = [];
          if (sessionEvm) pairs.push(["Session EVM", sessionEvm]);
          if (sessionSolana) pairs.push(["Session Solana", sessionSolana]);
          if (localState.evmAddress) pairs.push(["Local EVM", localState.evmAddress]);
          if (localSolanaAddress) pairs.push(["Local Solana", localSolanaAddress]);
          if (activeSigner) pairs.push(["Active Signer", green(activeSigner)]);
          printKeyValue(pairs);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("qr")
    .description("Display wallet address as a QR code")
    .option("--type <type>", "Wallet type to show (evm|solana)")
    .option("--solana", "Show Solana address instead of EVM")
    .action(async (opts: { type?: string; solana?: boolean }) => {
      try {
        const cfg = config.load();
        const session = resolveWalletSession();
        const sessionEvm = session?.evmAddress ?? null;
        const sessionSolana = session?.solanaAddress ?? null;
        const needsAvailability = !opts.type && !opts.solana && isInteractiveAllowed(program);
        const available = needsAvailability
          ? {
              evm: Boolean(sessionEvm || resolveWalletKey(program, cfg)),
              solana: Boolean(sessionSolana || resolveSolanaWalletKey(program, cfg)),
            }
          : {
              evm: Boolean(sessionEvm),
              solana: Boolean(sessionSolana),
            };

        const type = await resolveQrWalletType(program, opts, available);
        if (type === null) return;

        const explicitSigner = typeof resolveActiveSigner === "function"
          ? resolveActiveSigner(program, cfg) ?? null
          : null;
        let missingSource: WalletSource | null = explicitSigner;

        const resolved = type === "solana"
          ? await (async () => {
              if (explicitSigner === "session") {
                return resolveQrAddress({
                  preferredSource: "session",
                  sessionAddress: sessionSolana,
                  localAddress: null,
                });
              }

              const solanaKey = explicitSigner === "local" || !sessionSolana
                ? resolveSolanaWalletKey(program, cfg)
                : undefined;
              const localSolana = solanaKey ? await getSolanaWalletAddress(solanaKey) : null;
              return resolveQrAddress({
                preferredSource: explicitSigner,
                sessionAddress: sessionSolana,
                localAddress: localSolana,
              });
            })()
          : (() => {
              if (explicitSigner === "session") {
                return resolveQrAddress({
                  preferredSource: "session",
                  sessionAddress: sessionEvm,
                  localAddress: null,
                });
              }

              if (explicitSigner === "local") {
                const evmKey = resolveWalletKey(program, cfg);
                const localEvm = evmKey ? getEvmWalletAddress(evmKey) : null;
                return resolveQrAddress({
                  preferredSource: "local",
                  sessionAddress: null,
                  localAddress: localEvm,
                });
              }

              if (sessionEvm) {
                missingSource = null;
                return resolveQrAddress({
                  preferredSource: null,
                  sessionAddress: sessionEvm,
                  localAddress: null,
                });
              }

              const evmKey = resolveWalletKey(program, cfg);
              const localEvm = evmKey ? getEvmWalletAddress(evmKey) : null;
              missingSource = localEvm ? null : "local";
              return resolveQrAddress({
                preferredSource: null,
                sessionAddress: null,
                localAddress: localEvm,
              });
            })();

        if (!resolved) throw missingQrWalletError(type, missingSource);

        if (isJSONMode()) {
          printJSON({ type, address: resolved.address, source: resolved.source });
        } else {
          const qr = await QRCode.toString(resolved.address, { type: "terminal", small: true });
          console.log();
          console.log(indentBlock(qr));
          console.log(`  ${resolved.address}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("use")
    .argument("<target>", "session | local")
    .description("Set the active signer for EVM transactions")
    .action(async (target: string) => {
      try {
        if (target !== "session" && target !== "local") {
            throw errInvalidArgs("`wallet use` target must be 'session' or 'local'.");
        }
        if (target === "session" && !hasValidSessionWithEvm()) {
          throw errInvalidArgs(
            "No valid session with an EVM address. Run `alchemy wallet connect` first.",
          );
        }
        if (target === "local" && !hasLocalEvmKey()) {
          throw errInvalidArgs(
            "No local EVM key configured. Run `alchemy wallet connect --mode local` first.",
          );
        }
        const cfg = config.load();
        config.save({ ...cfg, active_signer: target });

        if (isJSONMode()) {
          printJSON({ activeSigner: target });
        } else {
          printKeyValue([["Active Signer", green(target)]]);
          console.log(`  ${green("✓")} Active signer set to ${target}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("disconnect")
    .description("Revoke the current wallet session")
    .action(async () => {
      try {
        const session = walletSession.loadStoredSession?.() ?? loadSession();
        if (!session) {
          if (isJSONMode()) {
            printJSON({ disconnected: false, revoked: false, alreadyDisconnected: false, remoteStatus: null });
          } else {
            printHuman(
              `  ${dim("No active wallet session.")}\n`,
              { disconnected: false },
            );
          }
          return;
        }

        const authToken = resolveAuthToken();
        let revoked = false;
        let alreadyDisconnected = false;
        let remoteStatus: RemoteWalletStatus | null = null;
        let backendRevokeFailed = false;
        const sessionIdsToDisconnect = uniqueSessionIds(session);

        if (authToken) {
          const results = await Promise.allSettled(
            sessionIdsToDisconnect.map((sessionId) =>
              disconnectRemoteWalletSession(authToken, sessionId),
            ),
          );
          const successfulResults = results.flatMap((result) => {
            return result.status === "fulfilled" ? [result.value] : [];
          });
          backendRevokeFailed = results.some((result) => {
            return result.status === "rejected";
          });
          revoked = successfulResults.some((remote) => !remote.alreadyDisconnected);
          alreadyDisconnected =
            successfulResults.length > 0 &&
            successfulResults.every((remote) => remote.alreadyDisconnected);
          remoteStatus = successfulResults[0]?.status ?? null;
        }

        const removed = clearSession();

        // Clear active_signer if it pointed at session — otherwise the next tx
        // errors with "no active session" after the user just disconnected.
        const cfg = config.load();
        if (cfg.active_signer === "session") {
          const { active_signer: _omit, ...rest } = cfg;
          config.save(rest);
        }

        if (isJSONMode()) {
          printJSON({
            disconnected: removed,
            revoked,
            alreadyDisconnected,
            remoteStatus,
            backendRevokeAttempted: Boolean(authToken),
            backendRevokeFailed,
          });
        } else if (removed && authToken && backendRevokeFailed) {
          console.log(`  ${green("✓")} Wallet session disconnected (${dim("backend revoke partially failed")})`);
        } else if (removed && authToken && alreadyDisconnected) {
          console.log(`  ${green("✓")} Wallet session disconnected (${dim("already revoked or expired")})`);
        } else if (removed && authToken) {
          console.log(`  ${green("✓")} Wallet session disconnected`);
        } else if (removed) {
          console.log(`  ${green("✓")} Wallet session disconnected (${dim("local only; backend not authenticated")})`);
        } else {
          printHuman(
            `  ${dim("No active wallet session.")}\n`,
            { disconnected: false },
          );
        }
      } catch (err) {
        exitWithError(err);
      }
    });

}

export const registerWallet = registerWallets;
