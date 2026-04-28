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
  createRemoteWalletSession,
  disconnectRemoteWalletSession,
  getRemoteWalletSession,
  getWalletApiBaseUrl,
} from "../lib/wallet-api.js";
import {
  resolveWalletKey,
  resolveSolanaWalletKey,
  resolveAuthToken,
  resolveWalletSession,
  resolveActiveSigner,
} from "../lib/resolve.js";
import { promptConfirm, promptSelect } from "../lib/terminal-ui.js";
import QRCode from "qrcode";
import { printHuman, isJSONMode, printJSON } from "../lib/output.js";
import { CLIError, ErrorCode, errAuthRequired, errInvalidArgs, errWalletKeyRequired, exitWithError } from "../lib/errors.js";
import { green, dim, printKeyValueBox } from "../lib/ui.js";
import { createPendingSession, loadSession, clearSession, isSessionValid, updateSession } from "../lib/wallet-session.js";
import * as walletSession from "../lib/wallet-session.js";

type WalletType = "evm" | "solana";
const CONNECT_POLL_INTERVAL_MS = 2_000;
const CONNECT_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_WALLET_CAPABILITIES = {
  "evm.signMessage": true,
  "evm.signTypedData": true,
  "evm.signAuthorization": true,
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

function normalizeRemoteStatusForStorage(status: RemoteWalletStatus): "pending" | "approved" | "revoked" | "expired" {
  if (status === "denied") {
    return "revoked";
  }
  return status;
}

function isFutureIsoDate(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date > new Date();
}

function isActiveWalletSession(
  session: walletSession.WalletSession | null,
  remoteStatus?: RemoteWalletStatus,
): boolean {
  if (!session) return false;
  if (session.status !== "approved") return false;
  if (!isFutureIsoDate(session.expiresAt)) return false;
  if (remoteStatus && remoteStatus !== "approved") return false;
  return true;
}

function deriveWalletStatus(
  session: walletSession.WalletSession | null,
  remoteStatus?: RemoteWalletStatus,
): WalletStatus {
  if (!session) return "none";
  if (isActiveWalletSession(session, remoteStatus)) return "active";
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

type LocalChain = "evm" | "solana" | "both";

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
  chain: LocalChain;
  force: boolean;
  program: Command;
}): Promise<{ evm?: { address: string; keyFile: string }; solana?: { address: string; keyFile: string } }> {
  const cfg = config.load();
  const wantsEvm = opts.chain === "evm" || opts.chain === "both";
  const wantsSolana = opts.chain === "solana" || opts.chain === "both";

  const evmConflict = wantsEvm && Boolean(cfg.wallet_key_file);
  const solanaConflict = wantsSolana && Boolean(cfg.solana_wallet_key_file);

  if ((evmConflict || solanaConflict) && !opts.force) {
    if (!isInteractiveAllowed(opts.program)) {
      throw errInvalidArgs(
        "A local key is already configured for the selected chain. Re-run with --force to replace it.",
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

  if (opts.chain === "both") {
    const { evm, solana } = await createAndPersistWallets();
    return { evm, solana };
  }
  if (opts.chain === "evm") {
    const evm = generateAndPersistWallet();
    return { evm };
  }
  const solana = await generateAndPersistSolanaWallet();
  return { solana };
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

async function runSessionConnect(opts: { program: Command; force: boolean }): Promise<void> {
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
      if (replace !== true) return;
    }
    clearSession();
  }

  const session = createPendingSession();
  const sessionEnvironment = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    interactive: isInteractiveAllowed(opts.program),
  };
  updateSession({
    chainType: "evm",
    capabilities: { ...DEFAULT_WALLET_CAPABILITIES },
    backendBaseUrl: getWalletApiBaseUrl(),
    environment: sessionEnvironment,
  });

  const remoteSession = await createRemoteWalletSession(authToken, {
    publicKeyJwk: session.publicKeyJwk,
    requestSignerVersion: session.envelopeVersion,
    chainType: "evm",
    capabilities: { ...DEFAULT_WALLET_CAPABILITIES },
    environment: sessionEnvironment,
  }).catch((err) => {
    clearSession();
    throw err;
  });

  updateSession({
    sessionId: remoteSession.sessionId,
    expiresAt: remoteSession.expiresAt ?? session.expiresAt,
  });

  if (!isJSONMode()) {
    printKeyValueBox([
      ["Session ID", remoteSession.sessionId],
      ["Status", "pending"],
      ["Approval URL", remoteSession.approvalUrl],
      ["Created", session.createdAt],
      ["Expires", remoteSession.expiresAt ?? session.expiresAt],
    ]);
    console.log(`  ${green("✓")} Wallet session created`);
    console.log(`  Opening browser for approval...`);
    console.log(`  ${dim("Waiting for dashboard approval to complete connection.")}`);
  }

  openBrowser(remoteSession.approvalUrl);

  const startedAt = Date.now();
  let approvedSession: Awaited<ReturnType<typeof getRemoteWalletSession>> | null = null;
  while (Date.now() - startedAt < CONNECT_TIMEOUT_MS) {
    const current = await getRemoteWalletSession(authToken, remoteSession.sessionId);
    if (current.status === "approved") {
      approvedSession = current;
      break;
    }
    if (current.status === "denied" || current.status === "revoked" || current.status === "expired") {
      clearSession();
      throw new CLIError(
        ErrorCode.INTERNAL_ERROR,
        `Wallet session ${current.status}.`,
        "Run 'alchemy wallet connect' to start a new approval flow.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, CONNECT_POLL_INTERVAL_MS));
  }

  if (!approvedSession) {
    throw new CLIError(
      ErrorCode.NETWORK_ERROR,
      "Timed out waiting for wallet approval.",
      "Finish approval in the dashboard and rerun 'alchemy wallet connect --force' if needed.",
    );
  }

  const walletId = approvedSession.walletId ?? approvedSession.evmWalletId;
  const evmAddress = approvedSession.evmAddress ?? approvedSession.address;

  if (!approvedSession.privyAppId || !walletId || !evmAddress) {
    throw new CLIError(
      ErrorCode.INTERNAL_ERROR,
      "Approved wallet session response missing required metadata.",
    );
  }

  updateSession({
    sessionId: approvedSession.sessionId ?? remoteSession.sessionId,
    status: "approved",
    expiresAt: approvedSession.expiresAt ?? remoteSession.expiresAt ?? session.expiresAt,
    privyAppId: approvedSession.privyAppId,
    walletId,
    evmWalletId: approvedSession.evmWalletId ?? walletId,
    evmAddress,
    solanaWalletId: approvedSession.solanaWalletId,
    solanaAddress: approvedSession.solanaAddress,
    privyKeyQuorumId: approvedSession.privyKeyQuorumId,
    privySignerId: approvedSession.privySignerId,
    chainType: approvedSession.chainType ?? "evm",
    capabilities: approvedSession.capabilities ?? { ...DEFAULT_WALLET_CAPABILITIES },
    backendBaseUrl: getWalletApiBaseUrl(),
    environment: sessionEnvironment,
  });

  if (isJSONMode()) {
    printJSON({
      sessionId: approvedSession.sessionId ?? remoteSession.sessionId,
      status: "approved",
      privyAppId: approvedSession.privyAppId,
      walletId,
      evmAddress,
      evmWalletId: approvedSession.evmWalletId ?? walletId,
      chainType: approvedSession.chainType ?? "evm",
      capabilities: approvedSession.capabilities ?? { ...DEFAULT_WALLET_CAPABILITIES },
      expiresAt: approvedSession.expiresAt ?? remoteSession.expiresAt ?? session.expiresAt,
    });
  } else {
    printKeyValueBox([
      ["Session ID", approvedSession.sessionId ?? remoteSession.sessionId],
      ["Status", green("approved")],
      ["Wallet ID", walletId],
      ["EVM Address", green(evmAddress)],
      ["Expires", approvedSession.expiresAt ?? remoteSession.expiresAt ?? session.expiresAt],
    ]);
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
  printKeyValueBox(pairs);
  console.log(`  ${green("✓")} Local wallet configured`);
}

function printPostLocalImportSummary(result: { evm: { address: string; keyFile: string } }): void {
  if (isJSONMode()) {
    printJSON({ mode: "local", evm: result.evm });
    return;
  }
  printKeyValueBox([
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
  opts: { mode?: string; chain?: string; import?: string; force?: boolean },
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

  if (importPath) {
    if (mode === "session") {
      throw errInvalidArgs("`--import` is only valid with `--mode local`.");
    }
    mode = "local";
  }

  let chain: LocalChain = "both";
  if (opts.chain !== undefined) {
    if (opts.chain !== "evm" && opts.chain !== "solana" && opts.chain !== "both") {
      throw errInvalidArgs("`--chain` must be 'evm', 'solana', or 'both'.");
    }
    chain = opts.chain;
  }

  if (importPath && chain !== "evm" && opts.chain !== undefined) {
    throw errInvalidArgs("`--import` implies `--chain evm`; omit `--chain` or set it to 'evm'.");
  }
  if (importPath) chain = "evm";

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
        { value: "session", label: "Session wallet", hint: "Recommended — Alchemy/Privy-managed, more secure" },
        { value: "local", label: "Local wallet", hint: "Private key stored on this machine" },
      ],
      initialValue: "session",
      cancelMessage: "Wallet connect cancelled.",
    });
    if (choice === null) return;
    mode = choice;
  }

  if (mode === "session") {
    await runSessionConnect({ program, force });
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

  const result = await runLocalCreate({ chain, force, program });
  printPostLocalCreateSummary(result);
  printCrossModeHintAfterLocal(chain);
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
  sessionState: walletSession.WalletSession["status"] | null;
  chainType: string | null;
  valid: boolean;
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

    const remote = await getRemoteWalletSession(authToken, session.sessionId);
    remoteStatus = remote.status;
    const walletId = remote.walletId ?? remote.evmWalletId;

    session = {
      ...session,
      status: normalizeRemoteStatusForStorage(remote.status),
      expiresAt: remote.expiresAt ?? session.expiresAt,
      privyAppId: remote.privyAppId ?? session.privyAppId,
      walletId: walletId ?? session.walletId,
      evmWalletId: remote.evmWalletId ?? walletId ?? session.evmWalletId,
      evmAddress: remote.evmAddress ?? remote.address ?? session.evmAddress,
      solanaWalletId: remote.solanaWalletId ?? session.solanaWalletId,
      solanaAddress: remote.solanaAddress ?? session.solanaAddress,
      chainType: remote.chainType ?? session.chainType,
      capabilities: remote.capabilities ?? session.capabilities,
    };
    walletSession.saveSession(session);
  }

  const status = deriveWalletStatus(session, remoteStatus ?? undefined);
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
    sessionState: session?.status ?? null,
    chainType: session?.chainType ?? null,
    valid: session ? isSessionValid(session) : false,
  };
}

export function registerWallet(program: Command) {
  const cmd = program.command("wallet").description("Manage wallet");

  // Canonical: `alchemy wallet connect` is the single entry point.
  cmd
    .command("connect")
    .description("Connect a wallet for onchain actions (session or local)")
    .option("--mode <mode>", "session | local")
    .option("--chain <chain>", "For --mode local: evm | solana | both (default: both)")
    .option("--import <path>", "For --mode local: import EVM key from file (implies --chain evm)")
    .option("--force", "Replace the existing signer")
    .action(async (opts: { mode?: string; chain?: string; import?: string; force?: boolean }) => {
      try {
        await runConnectFlow(program, opts);
      } catch (err) {
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
            sessionId: snap.sessionId,
            sessionState: snap.sessionState,
            walletId: snap.walletId,
            chainType: snap.chainType,
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
              sessionId: snap.sessionId,
              sessionState: snap.sessionState,
              walletId: snap.walletId,
              chainType: snap.chainType,
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
        if (snap.sessionId) pairs.push(["Session ID", snap.sessionId]);
        if (snap.walletId) pairs.push(["Wallet ID", snap.walletId]);
        if (opts.verify) {
          pairs.push(["Backend Status", snap.remoteStatus ?? dim("not checked")]);
        }

        printKeyValueBox(pairs);

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
          printKeyValueBox(pairs);
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
        const evmKey = resolveWalletKey(program);
        const solanaKey = resolveSolanaWalletKey(program);
        if (!evmKey && !solanaKey) throw errWalletKeyRequired();

        const type = await resolveQrWalletType(program, opts, {
          evm: Boolean(evmKey),
          solana: Boolean(solanaKey),
        });
        if (type === null) return;

        let address: string;

        if (type === "solana") {
          if (!solanaKey) throw errInvalidArgs("No Solana wallet is configured.");
          address = await getSolanaWalletAddress(solanaKey);
        } else {
          if (!evmKey) throw errInvalidArgs("No EVM wallet is configured.");
          address = getEvmWalletAddress(evmKey);
        }

        if (isJSONMode()) {
          printJSON({ type, address });
        } else {
          const qr = await QRCode.toString(address, { type: "terminal", small: true });
          console.log();
          console.log(qr);
          console.log(`  ${address}`);
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
            "No local EVM key configured. Run `alchemy wallet connect --mode local --chain evm` first.",
          );
        }
        const cfg = config.load();
        config.save({ ...cfg, active_signer: target });

        if (isJSONMode()) {
          printJSON({ activeSigner: target });
        } else {
          printKeyValueBox([["Active Signer", green(target)]]);
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

        if (authToken) {
          const remote = await disconnectRemoteWalletSession(authToken, session.sessionId);
          revoked = !remote.alreadyDisconnected;
          alreadyDisconnected = remote.alreadyDisconnected;
          remoteStatus = remote.status;
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
          });
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

  // Hidden back-compat aliases for the pre-unified surface. These route to the
  // same helpers as `connect --mode local`, and they preserve today's
  // "randomize path + repoint config" behavior (no --force gate, no prompt) so
  // existing scripts continue to work unchanged.
  const createAlias = async () => {
    try {
      const { evm, solana } = await createAndPersistWallets();
      if (isJSONMode()) {
        printJSON({ evm, solana });
      } else {
        printKeyValueBox([
          ["EVM Address", green(evm.address)],
          ["EVM Key file", evm.keyFile],
          ["Solana Address", green(solana.address)],
          ["Solana Key file", solana.keyFile],
        ]);
        console.log(`  ${green("✓")} Wallets created and saved to config`);
      }
    } catch (err) {
      exitWithError(err);
    }
  };

  const createCmd = cmd
    .command("create")
    .description("Create new EVM and Solana wallets")
    .action(createAlias);
  (createCmd as Command & { hidden?: boolean }).hidden = true;

  const generateCmd = cmd
    .command("generate")
    .description("Generate new wallets (alias for create)")
    .action(createAlias);
  (generateCmd as Command & { hidden?: boolean }).hidden = true;

  const importCmd = cmd
    .command("import")
    .argument("<path>", "Path to private key file")
    .description("Import an EVM wallet from a private key file")
    .action((path: string) => {
      try {
        const wallet = importAndPersistWallet(path);
        if (isJSONMode()) {
          printJSON(wallet);
        } else {
          printKeyValueBox([
            ["Address", green(wallet.address)],
            ["Key file", wallet.keyFile],
          ]);
          console.log(`  ${green("✓")} Wallet imported and saved to config`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
  (importCmd as Command & { hidden?: boolean }).hidden = true;
}
