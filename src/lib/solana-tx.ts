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
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Blockhash,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import type { AlchemyClient } from "./client-interface.js";
import { errInvalidArgs, errSolanaTransactionFailed } from "./errors.js";

const SOL_DECIMALS = 9;
const SPONSOR_FEE_PAYER_PLACEHOLDER = address("Amh6quo1FcmL16Qmzdugzjq3Lv1zXzTW7ktswyLDzits");

export { SOL_DECIMALS };

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

async function signerFromKeyBytes(keyBytes: Uint8Array) {
  if (keyBytes.length === 64) {
    return createKeyPairSignerFromBytes(keyBytes, true);
  }
  if (keyBytes.length === 32) {
    return createKeyPairSignerFromPrivateKeyBytes(keyBytes, true);
  }
  throw errInvalidArgs("Invalid Solana key: expected 64-byte secret key or 32-byte private key.");
}

export function buildSolTransferInstruction(
  from: KeyPairSigner,
  to: Address,
  lamports: bigint,
): Instruction {
  return getTransferSolInstruction({
    source: from,
    destination: to,
    amount: lamports,
  });
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

  const signer = await signerFromKeyBytes(senderKeyBytes);

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
      throw errInvalidArgs("Gas sponsorship requires a gas policy ID.");
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
