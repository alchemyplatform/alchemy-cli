import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";
import { hostname, userInfo } from "node:os";

const MAGIC = Buffer.from("ALCH_ENC", "ascii");
const VERSION = 0x01;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const PBKDF2_ITERATIONS = 100_000;
const HEADER_LEN = MAGIC.length + 1 + SALT_LEN + IV_LEN + TAG_LEN; // 53 bytes

function getMachinePassphrase(): string {
  const info = userInfo();
  return [hostname(), String(info.uid), info.username, "alchemy-cli-config-v1"].join(":");
}

function deriveKey(salt: Buffer): Buffer {
  return pbkdf2Sync(getMachinePassphrase(), salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
}

export function encrypt(plaintext: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    salt,
    iv,
    tag,
    encrypted,
  ]);
}

export function decrypt(data: Buffer): string {
  if (data.length < HEADER_LEN) {
    throw new Error("Encrypted config too short");
  }

  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Invalid encrypted config magic bytes");
  }

  const version = data[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`Unsupported config encryption version: ${version}`);
  }

  let offset = MAGIC.length + 1;
  const salt = data.subarray(offset, offset + SALT_LEN); offset += SALT_LEN;
  const iv = data.subarray(offset, offset + IV_LEN); offset += IV_LEN;
  const tag = data.subarray(offset, offset + TAG_LEN); offset += TAG_LEN;
  const ciphertext = data.subarray(offset);

  const key = deriveKey(salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

export function isEncrypted(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}
