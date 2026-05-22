import {
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  compileTransaction,
  partiallySignTransaction,
  signTransaction,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  pipe,
  address,
  AccountRole,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Blockhash,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import { sign as signWithPrivateKey } from "node:crypto";
import type { AlchemyClient } from "./client-interface.js";
import { errInvalidArgs, errSolanaTransactionFailed } from "./errors.js";
import {
  completeRemoteSolanaSignTransactionChallenge,
  createRemoteSolanaSignTransactionChallenge,
} from "./wallet-api.js";
import type { WalletSession } from "./wallet-session.js";

const SOL_DECIMALS = 9;
const SPONSOR_FEE_PAYER_PLACEHOLDER = address("Amh6quo1FcmL16Qmzdugzjq3Lv1zXzTW7ktswyLDzits");
const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const SPL_TOKEN_PROGRAM_ADDRESS = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export { SOL_DECIMALS, SPL_TOKEN_PROGRAM_ADDRESS };

export function parseSolanaKeyBytes(secret: string): Uint8Array {
  const trimmed = secret.trim();

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw errInvalidArgs("Invalid Solana key: expected JSON array or hex-encoded key.");
    }
    if (!Array.isArray(parsed) || !parsed.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
      throw errInvalidArgs("Invalid Solana key: expected an array of byte values.");
    }
    return Uint8Array.from(parsed);
  }

  if (!/^[a-fA-F0-9]+$/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw errInvalidArgs("Invalid Solana key: expected JSON array or hex-encoded key.");
  }
  return Uint8Array.from(Buffer.from(trimmed, "hex"));
}

export async function createSolanaSignerFromKeyBytes(
  keyBytes: Uint8Array,
): Promise<KeyPairSigner> {
  if (keyBytes.length === 64) {
    return createKeyPairSignerFromBytes(keyBytes, true);
  }
  if (keyBytes.length === 32) {
    return createKeyPairSignerFromPrivateKeyBytes(keyBytes, true);
  }
  throw errInvalidArgs("Invalid Solana key: expected 64-byte secret key or 32-byte private key.");
}

export function buildSolTransferInstruction(
  from: { address: Address },
  to: Address,
  lamports: bigint,
): Instruction {
  // Keep this signer-shaped instead of using getTransferSolInstruction so
  // session wallets can build transfer instructions without a local keypair.
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: from.address, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array([
      ...encodeU32LE(2),
      ...encodeU64LE(lamports),
    ]),
  };
}

function encodeU32LE(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw errInvalidArgs("Instruction discriminator must fit in an unsigned 32-bit integer.");
  }
  const bytes = new Uint8Array(4);
  bytes[0] = value & 0xff;
  bytes[1] = (value >> 8) & 0xff;
  bytes[2] = (value >> 16) & 0xff;
  bytes[3] = (value >> 24) & 0xff;
  return bytes;
}

function encodeU64LE(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw errInvalidArgs("Amount must fit in an unsigned 64-bit integer.");
  }

  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function buildSplTokenApproveCheckedInstruction(args: {
  tokenAccount: Address;
  mint: Address;
  delegate: Address;
  owner: { address: Address };
  amount: bigint;
  decimals: number;
}): Instruction {
  if (!Number.isInteger(args.decimals) || args.decimals < 0 || args.decimals > 255) {
    throw errInvalidArgs("Token decimals must be an integer between 0 and 255.");
  }

  return {
    programAddress: SPL_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: args.tokenAccount, role: AccountRole.WRITABLE },
      { address: args.mint, role: AccountRole.READONLY },
      { address: args.delegate, role: AccountRole.READONLY },
      { address: args.owner.address, role: AccountRole.READONLY_SIGNER },
    ],
    data: new Uint8Array([
      13,
      ...encodeU64LE(args.amount),
      args.decimals,
    ]),
  };
}

export function buildSplTokenRevokeInstruction(args: {
  tokenAccount: Address;
  owner: { address: Address };
}): Instruction {
  return {
    programAddress: SPL_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: args.tokenAccount, role: AccountRole.WRITABLE },
      { address: args.owner.address, role: AccountRole.READONLY_SIGNER },
    ],
    data: new Uint8Array([5]),
  };
}

export interface SolanaSendResult {
  signature: string;
  fromAddress: string;
}

export async function buildAndSendSolanaTransaction(opts: {
  client: AlchemyClient;
  instructions: Instruction[];
  senderKeyBytes: Uint8Array;
  sponsored: boolean;
  gasPolicyId?: string;
}): Promise<SolanaSendResult> {
  const { client, instructions, senderKeyBytes, sponsored, gasPolicyId } = opts;

  const signer = await createSolanaSignerFromKeyBytes(senderKeyBytes);

  // Get recent blockhash
  const blockhashResult = await client.call("getLatestBlockhash", [{ commitment: "finalized" }]) as {
    value: { blockhash: Blockhash; lastValidBlockHeight: bigint };
  };
  const { blockhash, lastValidBlockHeight } = blockhashResult.value;

  // Build transaction message
  const feePayer = sponsored ? SPONSOR_FEE_PAYER_PLACEHOLDER : signer.address;

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(address(feePayer), msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      msg,
    ),
    (msg) => appendTransactionMessageInstructions(instructions, msg),
  );

  const compiledTx = compileTransaction(txMessage);

  if (sponsored) {
    if (!gasPolicyId) {
      throw errInvalidArgs("Fee sponsorship requires a fee policy ID.");
    }

    // Serialize for sponsorship request
    const serializedTransaction = getBase64EncodedWireTransaction(compiledTx);

    // Request fee payer from Alchemy
    const feePayerResponse = await client.call("alchemy_requestFeePayer", [{
      policyId: gasPolicyId,
      serializedTransaction,
    }]) as { serializedTransaction: string };

    // Deserialize the sponsored transaction
    const sponsoredBytes = Buffer.from(feePayerResponse.serializedTransaction, "base64");
    const decoder = getTransactionDecoder();
    const sponsoredTx = decoder.decode(new Uint8Array(sponsoredBytes));

    // Sign with user keypair (fee payer already signed by Alchemy)
    const signedTx = await partiallySignTransaction([signer.keyPair], sponsoredTx);
    const wireTransaction = getBase64EncodedWireTransaction(signedTx);

    // Submit
    const signature = await client.call("sendTransaction", [wireTransaction, { encoding: "base64" }]) as string;

    return { signature, fromAddress: signer.address };
  }

  // Non-sponsored: sign fully and send
  const signedTx = await signTransaction([signer.keyPair], compiledTx);
  const wireTransaction = getBase64EncodedWireTransaction(signedTx);
  const signature = await client.call("sendTransaction", [wireTransaction, { encoding: "base64" }]) as string;

  return { signature, fromAddress: signer.address };
}

export async function buildAndSendSolanaTransactionWithSession(opts: {
  client: AlchemyClient;
  instructions: Instruction[];
  session: WalletSession;
  authToken: string;
  sponsored: boolean;
  gasPolicyId?: string;
}): Promise<SolanaSendResult> {
  const { client, instructions, session, authToken, sponsored, gasPolicyId } = opts;
  const fromAddress = getSolanaSessionAddress(session);

  const blockhashResult = await client.call("getLatestBlockhash", [{ commitment: "finalized" }]) as {
    value: { blockhash: Blockhash; lastValidBlockHeight: bigint };
  };
  const { blockhash, lastValidBlockHeight } = blockhashResult.value;
  const feePayer = sponsored ? SPONSOR_FEE_PAYER_PLACEHOLDER : address(fromAddress);

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(feePayer, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(
      { blockhash, lastValidBlockHeight },
      msg,
    ),
    (msg) => appendTransactionMessageInstructions(instructions, msg),
  );
  const compiledTx = compileTransaction(txMessage);

  const transactionToSign = sponsored
    ? await sponsorSolanaTransaction({
        client,
        compiledTransactionBase64: getBase64EncodedWireTransaction(compiledTx),
        gasPolicyId,
      })
    : getBase64EncodedWireTransaction(compiledTx);
  const signedTransaction = await signSolanaTransactionWithSession({
    authToken,
    session,
    transactionBase64: transactionToSign,
  });
  const signature = await client.call("sendTransaction", [
    signedTransaction,
    { encoding: "base64" },
  ]) as string;

  return { signature, fromAddress };
}

export async function waitForSolanaConfirmation(
  client: AlchemyClient,
  signature: string,
  timeoutMs = 60000,
  pollIntervalMs = 2000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.call("getSignatureStatuses", [[signature]]) as {
      value: Array<{ confirmationStatus?: string; err?: unknown } | null>;
    };
    const status = result.value[0];
    if (status?.err != null) {
      const details = typeof status.err === "string"
        ? status.err
        : JSON.stringify(status.err);
      throw errSolanaTransactionFailed(details);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return false;
}

async function sponsorSolanaTransaction(args: {
  client: AlchemyClient;
  compiledTransactionBase64: string;
  gasPolicyId?: string;
}): Promise<string> {
  if (!args.gasPolicyId) {
    throw errInvalidArgs("Fee sponsorship requires a fee policy ID.");
  }
  const feePayerResponse = await args.client.call("alchemy_requestFeePayer", [{
    policyId: args.gasPolicyId,
    serializedTransaction: args.compiledTransactionBase64,
  }]) as { serializedTransaction: string };
  return feePayerResponse.serializedTransaction;
}

async function signSolanaTransactionWithSession(args: {
  authToken: string;
  session: WalletSession;
  transactionBase64: string;
}): Promise<string> {
  const binding = getSolanaSessionBinding(args.session);
  if (args.session.capabilities?.["solana.signTransaction"] === false) {
    throw errInvalidArgs(
      "Delegated wallet session does not allow 'solana.signTransaction'. Reconnect the wallet session to refresh capabilities.",
    );
  }
  const challenge = await createRemoteSolanaSignTransactionChallenge(args.authToken, {
    ...binding,
    transaction: args.transactionBase64,
    encoding: "base64",
  });
  const completion = await completeRemoteSolanaSignTransactionChallenge(args.authToken, {
    challengeId: challenge.challengeId,
    signature: signChallengePayload({
      challengePayload: challenge.challenge,
      privateKeyPem: args.session.privateKeyPem,
    }),
  });
  return completion.signedTransaction;
}

function getSolanaSessionBinding(session: WalletSession) {
  const walletId = session.solanaWalletId ?? session.walletId;
  const walletAddress = getSolanaSessionAddress(session);
  if (!walletId) {
    throw errInvalidArgs(
      "Delegated wallet session is missing Solana wallet ID metadata. Run 'alchemy wallet connect --mode session --force'.",
    );
  }
  if (!session.privyKeyQuorumId && !session.privySignerId) {
    throw errInvalidArgs(
      "Delegated wallet session is missing signer binding metadata. Run 'alchemy wallet connect --mode session --force'.",
    );
  }
  return {
    sessionId: session.sessionId,
    walletId,
    walletAddress,
    privyKeyQuorumId: session.privyKeyQuorumId,
    privySignerId: session.privySignerId,
  };
}

function getSolanaSessionAddress(session: WalletSession): string {
  if (!session.solanaAddress) {
    throw errInvalidArgs(
      "Delegated wallet session is missing Solana address metadata. Run 'alchemy wallet connect --mode session --force'.",
    );
  }
  return session.solanaAddress;
}

function signChallengePayload(args: {
  challengePayload: string;
  privateKeyPem: string;
}): string {
  return signWithPrivateKey(
    "sha256",
    Buffer.from(args.challengePayload, "utf8"),
    {
      key: args.privateKeyPem,
      dsaEncoding: "der",
    },
  ).toString("base64url");
}
