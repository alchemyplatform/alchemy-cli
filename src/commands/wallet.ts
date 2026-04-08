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
import { isInteractiveAllowed } from "../lib/interaction.js";
import { resolveWalletKey, resolveSolanaWalletKey } from "../lib/resolve.js";
import { promptSelect } from "../lib/terminal-ui.js";
import QRCode from "qrcode";
import { printHuman, isJSONMode, printJSON } from "../lib/output.js";
import { errInvalidArgs, errWalletKeyRequired, exitWithError } from "../lib/errors.js";
import { green, printKeyValueBox } from "../lib/ui.js";

type WalletType = "evm" | "solana";

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

export function registerWallet(program: Command) {
  const cmd = program.command("wallet").description("Manage wallet");

  const createAction = async () => {
    try {
      const { evm: evmWallet, solana: solanaWallet } = await createAndPersistWallets();

      if (isJSONMode()) {
        printJSON({
          evm: evmWallet,
          solana: solanaWallet,
        });
      } else {
        printKeyValueBox([
          ["EVM Address", green(evmWallet.address)],
          ["EVM Key file", evmWallet.keyFile],
          ["Solana Address", green(solanaWallet.address)],
          ["Solana Key file", solanaWallet.keyFile],
        ]);
        console.log(`  ${green("✓")} Wallets created and saved to config`);
      }
    } catch (err) {
      exitWithError(err);
    }
  };

  cmd
    .command("create")
    .description("Create new EVM and Solana wallets")
    .action(createAction);

  cmd
    .command("generate")
    .description("Generate new wallets (alias for create)")
    .action(createAction);

  cmd
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

  cmd
    .command("address")
    .description("Display the addresses of configured wallets")
    .action(async () => {
      try {
        const evmKey = resolveWalletKey(program);
        const solanaKey = resolveSolanaWalletKey(program);

        if (!evmKey && !solanaKey) throw errWalletKeyRequired();

        const evmAddress = evmKey ? getEvmWalletAddress(evmKey) : undefined;
        const solanaAddress = solanaKey ? await getSolanaWalletAddress(solanaKey) : undefined;

        if (isJSONMode()) {
          printJSON({
            evm: evmAddress ?? null,
            solana: solanaAddress ?? null,
          });
        } else {
          const pairs: [string, string][] = [];
          if (evmAddress) pairs.push(["EVM", evmAddress]);
          if (solanaAddress) pairs.push(["Solana", solanaAddress]);
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
          if (!solanaKey) {
            throw errInvalidArgs("No Solana wallet is configured.");
          }
          address = await getSolanaWalletAddress(solanaKey);
        } else {
          if (!evmKey) {
            throw errInvalidArgs("No EVM wallet is configured.");
          }
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
}
