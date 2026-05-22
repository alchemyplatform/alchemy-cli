import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";
import { configDir } from "./config.js";

const SESSION_FILE = "wallet-session.json";
const SESSION_TTL_DAYS = 7;
const SESSION_ENVELOPE_VERSION = "v1";

const walletSessionCapabilitiesSchema = z
  .object({
    "evm.signMessage": z.boolean().optional(),
    "evm.signTypedData": z.boolean().optional(),
    "evm.signAuthorization": z.boolean().optional(),
    "solana.signTransaction": z.boolean().optional(),
  })
  .strict();

const walletSessionEnvironmentSchema = z
  .object({
    platform: z.string().min(1),
    arch: z.string().min(1),
    nodeVersion: z.string().min(1),
    interactive: z.boolean(),
    clientInstanceId: z.string().uuid().optional(),
    clientInstanceName: z.string().min(1).max(64).optional(),
  })
  .strict();

const chainWalletSessionSchema = z
  .object({
    sessionId: z.string().uuid(),
    status: z.enum(["pending", "approved", "revoked", "expired"]),
    expiresAt: z.string().datetime(),
    chainType: z.enum(["evm", "solana"]),
    walletId: z.string().min(1).optional(),
    walletAddress: z.string().min(1).optional(),
    providerKeyQuorumId: z.string().min(1).optional(),
    providerSignerId: z.string().min(1).optional(),
    capabilities: walletSessionCapabilitiesSchema.optional(),
  })
  .strict();

const walletSessionSchema = z
  .object({
    version: z.number().int().positive().optional(),
    connectionRequestId: z.string().min(1).optional(),
    sessionId: z.string().uuid(),
    status: z.enum(["pending", "approved", "revoked", "expired"]),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    envelopeVersion: z.string().min(1),
    publicKeyJwk: z.object({}).passthrough(),
    privateKeyPem: z.string().min(1),
    privyAppId: z.string().min(1).optional(),
    walletId: z.string().min(1).optional(),
    evmWalletId: z.string().min(1).optional(),
    evmAddress: z.string().min(1).optional(),
    solanaWalletId: z.string().min(1).optional(),
    solanaAddress: z.string().min(1).optional(),
    privyKeyQuorumId: z.string().min(1).optional(),
    privySignerId: z.string().min(1).optional(),
    chainType: z.string().min(1).optional(),
    backendBaseUrl: z.string().min(1).optional(),
    environment: walletSessionEnvironmentSchema.optional(),
    capabilities: walletSessionCapabilitiesSchema.optional(),
    sessionsByChain: z
      .object({
        evm: chainWalletSessionSchema.optional(),
        solana: chainWalletSessionSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type WalletChainType = "evm" | "solana";

export interface ChainWalletSession {
  sessionId: string;
  status: "pending" | "approved" | "revoked" | "expired";
  expiresAt: string;
  chainType: WalletChainType;
  walletId?: string;
  walletAddress?: string;
  providerKeyQuorumId?: string;
  providerSignerId?: string;
  capabilities?: WalletSession["capabilities"];
}

export interface WalletSession {
  version?: number;
  connectionRequestId?: string;
  sessionId: string;
  status: "pending" | "approved" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  envelopeVersion: string;

  // Local P-256 keypair
  publicKeyJwk: JsonWebKey;
  privateKeyPem: string;

  // Populated after approval
  privyAppId?: string;
  walletId?: string;
  evmWalletId?: string;
  evmAddress?: string;
  solanaWalletId?: string;
  solanaAddress?: string;
  privyKeyQuorumId?: string;
  privySignerId?: string;
  chainType?: string;
  backendBaseUrl?: string;
  environment?: {
    platform: string;
    arch: string;
    nodeVersion: string;
    interactive: boolean;
    clientInstanceId?: string;
    clientInstanceName?: string;
  };

  // Capability flags
  capabilities?: {
    "evm.signMessage"?: boolean;
    "evm.signTypedData"?: boolean;
    "evm.signAuthorization"?: boolean;
    "solana.signTransaction"?: boolean;
  };
  sessionsByChain?: Partial<Record<WalletChainType, ChainWalletSession>>;
}

interface P256Keypair {
  publicKeyJwk: JsonWebKey;
  privateKeyPem: string;
}

export interface WalletSessionStore {
  load(): WalletSession | null;
  loadRaw?(): WalletSession | null;
  save(session: WalletSession): void;
  clear(): boolean;
}

function sessionPath(): string {
  return join(configDir(), SESSION_FILE);
}

function parseStoredSession(value: unknown): WalletSession | null {
  const parsed = walletSessionSchema.safeParse(value);
  if (!parsed.success) return null;
  return withLegacyChainSessions(parsed.data as WalletSession);
}

function withLegacyChainSessions(session: WalletSession): WalletSession {
  if (session.sessionsByChain) {
    return withCompatibilityAliases(session);
  }

  const chainType = session.chainType === "solana" ? "solana" : "evm";
  const walletId = chainType === "solana"
    ? session.solanaWalletId ?? session.walletId
    : session.evmWalletId ?? session.walletId;
  const walletAddress = chainType === "solana"
    ? session.solanaAddress
    : session.evmAddress;

  return withCompatibilityAliases({
    ...session,
    version: session.version ?? 1,
    sessionsByChain: {
      [chainType]: {
        sessionId: session.sessionId,
        status: session.status,
        expiresAt: session.expiresAt,
        chainType,
        ...(walletId ? { walletId } : {}),
        ...(walletAddress ? { walletAddress } : {}),
        ...(session.privyKeyQuorumId
          ? { providerKeyQuorumId: session.privyKeyQuorumId }
          : {}),
        ...(session.privySignerId
          ? { providerSignerId: session.privySignerId }
          : {}),
        ...(session.capabilities ? { capabilities: session.capabilities } : {}),
      },
    },
  });
}

function withCompatibilityAliases(session: WalletSession): WalletSession {
  const evm = session.sessionsByChain?.evm;
  const solana = session.sessionsByChain?.solana;
  const preferred = evm ?? solana;
  if (!preferred) {
    return session;
  }

  return {
    ...session,
    sessionId: preferred.sessionId,
    status: preferred.status,
    expiresAt: preferred.expiresAt,
    walletId: evm?.walletId ?? solana?.walletId ?? session.walletId,
    evmWalletId: evm?.walletId ?? session.evmWalletId,
    evmAddress: evm?.walletAddress ?? session.evmAddress,
    solanaWalletId: solana?.walletId ?? session.solanaWalletId,
    solanaAddress: solana?.walletAddress ?? session.solanaAddress,
    privyKeyQuorumId:
      evm?.providerKeyQuorumId ??
      solana?.providerKeyQuorumId ??
      session.privyKeyQuorumId,
    privySignerId:
      evm?.providerSignerId ??
      solana?.providerSignerId ??
      session.privySignerId,
    chainType: evm && solana ? "both" : preferred.chainType,
    capabilities: {
      ...(evm?.capabilities ?? {}),
      ...(solana?.capabilities ?? {}),
      ...(session.capabilities ?? {}),
    },
  };
}

function loadStoredSessionFromPath(path: string): WalletSession | null {
  if (!existsSync(path)) return null;
  try {
    return parseStoredSession(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

function isExpired(session: { expiresAt: string }): boolean {
  const expiresAt = new Date(session.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

function isSessionLoadable(session: WalletSession): boolean {
  if (session.sessionsByChain) {
    return Object.values(session.sessionsByChain).some((chainSession) => {
      return Boolean(
        chainSession &&
          chainSession.status !== "revoked" &&
          !isExpired(chainSession),
      );
    });
  }
  if (session.status === "revoked") return false;
  return !isExpired(session);
}

export function createFileWalletSessionStore(path = sessionPath()): WalletSessionStore {
  return {
    load() {
      const session = loadStoredSessionFromPath(path);
      if (!session) return null;
      if (!isSessionLoadable(session)) return null;
      return session;
    },
    loadRaw() {
      return loadStoredSessionFromPath(path);
    },
    save(session) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
      writeFileSync(path, JSON.stringify(session, null, 2) + "\n", { mode: 0o600 });
    },
    clear() {
      if (!existsSync(path)) return false;
      try {
        rmSync(path, { force: true });
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryWalletSessionStore(initialSession: WalletSession | null = null): WalletSessionStore {
  let session = initialSession;
  return {
    load() {
      if (!session) return null;
      if (!isSessionLoadable(session)) return null;
      return session;
    },
    save(nextSession) {
      session = nextSession;
    },
    loadRaw() {
      return session;
    },
    clear() {
      const hadSession = session !== null;
      session = null;
      return hadSession;
    },
  };
}

let walletSessionStore: WalletSessionStore | null = null;

function getWalletSessionStore(): WalletSessionStore {
  if (!walletSessionStore) {
    walletSessionStore = createFileWalletSessionStore();
  }
  return walletSessionStore;
}

export function setWalletSessionStore(store: WalletSessionStore): void {
  walletSessionStore = store;
}

export function resetWalletSessionStore(): void {
  walletSessionStore = null;
}

export function generateP256Keypair(): P256Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });

  const publicKeyJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }) as string;

  return { publicKeyJwk, privateKeyPem };
}

export function createPendingSession(): WalletSession {
  const keypair = generateP256Keypair();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session: WalletSession = {
    version: 2,
    sessionId: randomUUID(),
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    envelopeVersion: SESSION_ENVELOPE_VERSION,
    publicKeyJwk: keypair.publicKeyJwk,
    privateKeyPem: keypair.privateKeyPem,
  };

  saveSession(session);
  return session;
}

export function loadSession(): WalletSession | null {
  return getWalletSessionStore().load();
}

export function loadStoredSession(): WalletSession | null {
  const store = getWalletSessionStore();
  if (store.loadRaw) {
    return store.loadRaw();
  }
  return store.load();
}

export function saveSession(session: WalletSession): void {
  getWalletSessionStore().save(withCompatibilityAliases(session));
}

export function updateSession(updates: Partial<WalletSession>): WalletSession | null {
  const session = loadSession();
  if (!session) return null;

  const updated = withCompatibilityAliases({ ...session, ...updates });
  saveSession(updated);
  return updated;
}

export function clearSession(): boolean {
  return getWalletSessionStore().clear();
}

export function isSessionValid(session: WalletSession): boolean {
  if (session.sessionsByChain) {
    return Object.values(session.sessionsByChain).some((chainSession) => {
      return Boolean(chainSession && isChainSessionValid(chainSession));
    });
  }
  if (session.status !== "approved") return false;
  const expiresAt = new Date(session.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt > new Date();
}

function isChainSessionValid(session: ChainWalletSession): boolean {
  if (session.status !== "approved") return false;
  const expiresAt = new Date(session.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt > new Date();
}

export function getWalletSessionByChain(
  session: WalletSession,
  chainType: WalletChainType,
): WalletSession | null {
  const chainSession = session.sessionsByChain?.[chainType];
  if (!chainSession) {
    if (!isSessionValid(session)) return null;
    const legacyChainType = session.chainType === "solana" ? "solana" : "evm";
    if (chainType !== legacyChainType) return null;
    if (legacyChainType === "evm" && session.evmAddress) return session;
    if (legacyChainType === "solana" && session.solanaAddress) return session;
    return null;
  }
  if (!isChainSessionValid(chainSession)) {
    return null;
  }

  return withCompatibilityAliases({
    ...session,
    sessionId: chainSession.sessionId,
    status: chainSession.status,
    expiresAt: chainSession.expiresAt,
    walletId: chainSession.walletId,
    evmWalletId: chainType === "evm" ? chainSession.walletId : session.evmWalletId,
    evmAddress: chainType === "evm" ? chainSession.walletAddress : session.evmAddress,
    solanaWalletId:
      chainType === "solana" ? chainSession.walletId : session.solanaWalletId,
    solanaAddress:
      chainType === "solana" ? chainSession.walletAddress : session.solanaAddress,
    privyKeyQuorumId: chainSession.providerKeyQuorumId,
    privySignerId: chainSession.providerSignerId,
    chainType,
    capabilities: chainSession.capabilities ?? session.capabilities,
    sessionsByChain: {
      [chainType]: chainSession,
    },
  });
}
