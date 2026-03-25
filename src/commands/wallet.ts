import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { generateWallet, getWalletAddress } from "@alchemy/x402";
import * as config from "../lib/config.js";
import { resolveWalletKey } from "../lib/resolve.js";
import { printHuman, isJSONMode, printJSON } from "../lib/output.js";
import { errInvalidArgs, errWalletKeyRequired, exitWithError } from "../lib/errors.js";
import { green, printKeyValueBox } from "../lib/ui.js";

const WALLET_KEYS_DIR = "wallet-keys";
const UUID_SLICE_LEN = 8;
const ADDRESS_SLICE_LEN = 12;

function walletKeysDirPath(): string {
  return join(config.configDir(), WALLET_KEYS_DIR);
}

function walletKeyPath(address: string): string {
  const addr = address
    .trim()
    .toLowerCase()
    .replace(/^0x/, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, ADDRESS_SLICE_LEN);
  const addressTag = addr || "unknown";
  const fileName = `wallet-key-${addressTag}-${Date.now()}-${randomUUID().slice(0, UUID_SLICE_LEN)}.txt`;
  return join(walletKeysDirPath(), fileName);
}

function persistWalletKey(privateKey: string, address: string): string {
  const keyPath = walletKeyPath(address);
  mkdirSync(dirname(keyPath), { recursive: true, mode: 0o755 });
  // Use exclusive write to guarantee we never replace an existing key file.
  writeFileSync(keyPath, privateKey + "\n", { mode: 0o600, flag: "wx" });
  return keyPath;
}

export function generateAndPersistWallet(): { address: string; keyFile: string } {
  const wallet = generateWallet();
  const keyPath = persistWalletKey(wallet.privateKey, wallet.address);

  const cfg = config.load();
  config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: wallet.address });
  return { address: wallet.address, keyFile: keyPath };
}

export function importAndPersistWallet(path: string): { address: string; keyFile: string } {
  let key: string;
  try {
    key = readFileSync(path, "utf-8").trim();
  } catch {
    throw errInvalidArgs(`Could not read key file: ${path}`);
  }

  const address = getWalletAddress(key);
  const keyPath = persistWalletKey(key, address);

  const cfg = config.load();
  config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: address });
  return { address, keyFile: keyPath };
}

export function registerWallet(program: Command) {
  const cmd = program
    .command("wallet")
    .description("Manage x402 wallet")
    .addHelpText(
      "after",
      `
Examples:
  alchemy wallet generate
  alchemy wallet import ./my-private-key.txt
  alchemy wallet address`,
    );

  cmd
    .command("generate")
    .description("Generate a new wallet for x402 authentication")
    .action(() => {
      try {
        const wallet = generateAndPersistWallet();

        if (isJSONMode()) {
          printJSON(wallet);
        } else {
          printKeyValueBox([
            ["Address", green(wallet.address)],
            ["Key file", wallet.keyFile],
          ]);
          console.log(`  ${green("✓")} Wallet generated and saved to config`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("import")
    .argument("<path>", "Path to private key file")
    .description("Import a wallet from a private key file")
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
    .description("Display the address of the configured wallet")
    .action(() => {
      try {
        const key = resolveWalletKey(program);
        if (!key) throw errWalletKeyRequired();

        const address = getWalletAddress(key);

        printHuman(
          `${address}\n`,
          { address },
        );
      } catch (err) {
        exitWithError(err);
      }
    });
}
