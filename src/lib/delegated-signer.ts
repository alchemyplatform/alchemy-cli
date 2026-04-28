import { sign as signWithPrivateKey } from "node:crypto";
import type { Address } from "viem";
import { isAddressEqual, recoverMessageAddress, recoverTypedDataAddress } from "viem";
import { toAccount } from "viem/accounts";
import {
  completeRemoteSignAuthorizationChallenge,
  completeRemoteSignMessageChallenge,
  completeRemoteSignTypedDataChallenge,
  createRemoteSignAuthorizationChallenge,
  createRemoteSignMessageChallenge,
  createRemoteSignTypedDataChallenge,
  type EvmSigningSessionBindingInput,
} from "./wallet-api.js";
import type { WalletSession } from "./wallet-session.js";
import { errInvalidArgs } from "./errors.js";
import { debug } from "./output.js";

const messageCapabilities = {
  signMessage: "evm.signMessage",
  signTypedData: "evm.signTypedData",
  signAuthorization: "evm.signAuthorization",
} as const;
type DelegatedCapability = (typeof messageCapabilities)[keyof typeof messageCapabilities];

function toHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function normalizeSignedChallengeSignature(signature: Buffer): string {
  return signature.toString("base64url");
}

function signChallengePayload(args: {
  challengePayload: string;
  privateKeyPem: string;
}): string {
  const signature = signWithPrivateKey(
    "sha256",
    Buffer.from(args.challengePayload, "utf8"),
    {
      key: args.privateKeyPem,
      dsaEncoding: "der",
    },
  );
  return normalizeSignedChallengeSignature(signature);
}

function normalizeNumberInput(value: unknown, field: string): number | string {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  throw errInvalidArgs(`Delegated signer received invalid ${field} value.`);
}

function buildSessionBindingInput(session: WalletSession): EvmSigningSessionBindingInput {
  const walletId = session.walletId ?? session.evmWalletId;
  if (!walletId) {
    throw errInvalidArgs(
      "Delegated wallet session is missing wallet ID metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.evmAddress) {
    throw errInvalidArgs(
      "Delegated wallet session is missing EVM address metadata. Run 'alchemy wallet connect --force'.",
    );
  }
  if (!session.privyKeyQuorumId && !session.privySignerId) {
    throw errInvalidArgs(
      "Delegated wallet session is missing signer binding metadata. Run 'alchemy wallet connect --force'.",
    );
  }

  return {
    sessionId: session.sessionId,
    walletId,
    walletAddress: session.evmAddress,
    privyKeyQuorumId: session.privyKeyQuorumId,
    privySignerId: session.privySignerId,
  };
}

function assertCapabilityEnabled(
  session: WalletSession,
  capability: DelegatedCapability,
): void {
  if (session.capabilities?.[capability] === false) {
    throw errInvalidArgs(
      `Delegated wallet session does not allow '${capability}'. Reconnect the wallet session to refresh capabilities.`,
    );
  }
}

function serializeTransportValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return toHex(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => serializeTransportValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    const serializedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, serializeTransportValue(entry)] as const)
      .filter(([, entry]) => entry !== undefined);
    return Object.fromEntries(serializedEntries);
  }
  return String(value);
}

function toRemoteMessage(message: unknown): { message: string; encoding: "utf-8" | "hex" } {
  if (typeof message === "string") {
    return { message, encoding: "utf-8" };
  }
  if (typeof message === "object" && message !== null && "raw" in message) {
    const raw = (message as { raw: unknown }).raw;
    if (typeof raw === "string") {
      if (raw.startsWith("0x")) {
        return { message: raw, encoding: "hex" };
      }
      return { message: raw, encoding: "utf-8" };
    }
    if (raw instanceof Uint8Array) {
      return { message: toHex(raw), encoding: "hex" };
    }
  }

  throw errInvalidArgs("Delegated signer received an unsupported message payload.");
}

function normalizeAuthorizationInput(authorization: unknown): {
  contract: string;
  chainId: number | string;
  nonce?: number | string;
  executor?: "self";
} {
  if (authorization == null || typeof authorization !== "object") {
    throw errInvalidArgs("Delegated signer received an invalid EIP-7702 authorization payload.");
  }

  const payload = authorization as Record<string, unknown>;
  const contractRaw = payload.contract ?? payload.contractAddress ?? payload.address;
  if (typeof contractRaw !== "string" || contractRaw.trim().length === 0) {
    throw errInvalidArgs("Delegated signer received an EIP-7702 payload without a contract address.");
  }

  const chainIdRaw = payload.chainId ?? payload.chain_id;
  if (chainIdRaw === undefined) {
    throw errInvalidArgs("Delegated signer received an EIP-7702 payload without chainId.");
  }

  const nonceRaw = payload.nonce;
  const executorRaw = payload.executor;

  return {
    contract: contractRaw,
    chainId: normalizeNumberInput(chainIdRaw, "chainId"),
    ...(nonceRaw !== undefined
      ? { nonce: normalizeNumberInput(nonceRaw, "nonce") }
      : {}),
    ...(executorRaw === "self" ? { executor: "self" } : {}),
  };
}

function parseQuantity(value: string): bigint {
  if (value.startsWith("0x")) {
    return BigInt(value);
  }
  return BigInt(value);
}

function compactValue(value: string, prefixLength = 12): string {
  if (value.length <= prefixLength + 3) {
    return value;
  }
  return `${value.slice(0, prefixLength)}...`;
}

async function debugRecoveredMessageAddress(args: {
  message: string;
  encoding: "utf-8" | "hex";
  signature: `0x${string}`;
  expectedAddress: Address;
}): Promise<void> {
  try {
    const recovered = await recoverMessageAddress({
      message: args.encoding === "hex"
        ? { raw: args.message as `0x${string}` }
        : args.message,
      signature: args.signature,
    });
    debug(
      `Delegated signer recovered message signer ${recovered} (expected ${args.expectedAddress}).`,
    );
    if (!isAddressEqual(recovered, args.expectedAddress)) {
      debug(
        "Delegated signer signature recovered to an unexpected address. This can cause user operation signature validation failures.",
      );
    }
  } catch (error) {
    debug(
      `Delegated signer could not recover message signer address: ${String(error)}`,
    );
  }
}

async function debugRecoveredTypedDataAddress(args: {
  typedData: Record<string, unknown>;
  signature: `0x${string}`;
  expectedAddress: Address;
}): Promise<void> {
  try {
    const recovered = await recoverTypedDataAddress({
      ...(args.typedData as any),
      signature: args.signature,
    });
    debug(
      `Delegated signer recovered typed data signer ${recovered} (expected ${args.expectedAddress}).`,
    );
    if (!isAddressEqual(recovered, args.expectedAddress)) {
      debug(
        "Delegated signer typed data signature recovered to an unexpected address. This can cause user operation signature validation failures.",
      );
    }
  } catch (error) {
    debug(
      `Delegated signer could not recover typed data signer address: ${String(error)}`,
    );
  }
}

export function createDelegatedAccount(args: {
  authToken: string;
  session: WalletSession;
}) {
  const sessionBinding = buildSessionBindingInput(args.session);
  const address = args.session.evmAddress as Address;

  return toAccount({
    address,
    async signTransaction(): Promise<never> {
      throw errInvalidArgs(
        "Delegated signer does not support direct transaction signing. Use wallet commands that execute through Alchemy smart wallets.",
      );
    },
    async signMessage(signMessageInput: any): Promise<`0x${string}`> {
      assertCapabilityEnabled(args.session, messageCapabilities.signMessage);
      const remoteMessage = toRemoteMessage(signMessageInput.message);
      debug(
        `Delegated signer signMessage requested (encoding=${remoteMessage.encoding}, message=${compactValue(remoteMessage.message)}).`,
      );
      const challenge = await createRemoteSignMessageChallenge(args.authToken, {
        ...sessionBinding,
        message: remoteMessage.message,
        encoding: remoteMessage.encoding,
      });
      const signature = signChallengePayload({
        challengePayload: challenge.challenge,
        privateKeyPem: args.session.privateKeyPem,
      });
      const completion = await completeRemoteSignMessageChallenge(args.authToken, {
        challengeId: challenge.challengeId,
        signature,
      });
      const signedMessage = completion.signature as `0x${string}`;
      debug(`Delegated signer signMessage completed (signature=${compactValue(signedMessage)}).`);
      await debugRecoveredMessageAddress({
        message: remoteMessage.message,
        encoding: remoteMessage.encoding,
        signature: signedMessage,
        expectedAddress: address,
      });
      return signedMessage;
    },
    async signTypedData(signTypedDataInput: any): Promise<`0x${string}`> {
      assertCapabilityEnabled(args.session, messageCapabilities.signTypedData);
      const typedDataInput = { ...signTypedDataInput } as Record<string, unknown>;
      delete typedDataInput.account;

      const serializedTypedData = serializeTransportValue(typedDataInput);
      if (
        serializedTypedData == null ||
        typeof serializedTypedData !== "object" ||
        Array.isArray(serializedTypedData)
      ) {
        throw errInvalidArgs("Delegated signer could not serialize typed data payload.");
      }
      debug(
        `Delegated signer signTypedData requested (primaryType=${String(
          (serializedTypedData as Record<string, unknown>).primaryType ?? "unknown",
        )}).`,
      );

      const challenge = await createRemoteSignTypedDataChallenge(args.authToken, {
        ...sessionBinding,
        typedData: serializedTypedData as Record<string, unknown>,
      });
      const signature = signChallengePayload({
        challengePayload: challenge.challenge,
        privateKeyPem: args.session.privateKeyPem,
      });
      const completion = await completeRemoteSignTypedDataChallenge(args.authToken, {
        challengeId: challenge.challengeId,
        signature,
      });
      const typedDataSignature = completion.signature as `0x${string}`;
      debug(
        `Delegated signer signTypedData completed (signature=${compactValue(typedDataSignature)}).`,
      );
      await debugRecoveredTypedDataAddress({
        typedData: serializedTypedData as Record<string, unknown>,
        signature: typedDataSignature,
        expectedAddress: address,
      });
      return typedDataSignature;
    },
    async signAuthorization(authorizationInput: any): Promise<any> {
      assertCapabilityEnabled(args.session, messageCapabilities.signAuthorization);
      const authorization = normalizeAuthorizationInput(authorizationInput);
      debug(
        `Delegated signer signAuthorization requested (contract=${authorization.contract}, chainId=${String(authorization.chainId)}).`,
      );
      const challenge = await createRemoteSignAuthorizationChallenge(args.authToken, {
        ...sessionBinding,
        authorization,
      });
      const signature = signChallengePayload({
        challengePayload: challenge.challenge,
        privateKeyPem: args.session.privateKeyPem,
      });
      const completion = await completeRemoteSignAuthorizationChallenge(args.authToken, {
        challengeId: challenge.challengeId,
        signature,
      });
      return {
        contractAddress: completion.authorization.contract,
        chainId: parseQuantity(completion.authorization.chain_id),
        nonce: parseQuantity(completion.authorization.nonce),
        yParity: completion.authorization.y_parity,
        r: completion.authorization.r,
        s: completion.authorization.s,
      };
    },
  });
}
