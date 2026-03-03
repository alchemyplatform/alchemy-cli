import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { Command } from "commander";
import { generateWallet, getWalletAddress } from "@alchemy/x402";
import * as config from "../lib/config.js";
import { resolveWalletKey } from "../lib/resolve.js";
import { printHuman, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { green, printKeyValueBox } from "../lib/ui.js";
import { errInvalidArgs, errWalletKeyRequired } from "../lib/errors.js";

function walletKeyPath(): string {
  return join(config.configDir(), "wallet-key.txt");
}

export function registerWallet(program: Command) {
  const cmd = program.command("wallet").description("Manage x402 wallet");

  cmd
    .command("generate")
    .description("Generate a new wallet for x402 authentication")
    .action(() => {
      try {
        const wallet = generateWallet();
        const keyPath = walletKeyPath();

        mkdirSync(dirname(keyPath), { recursive: true, mode: 0o755 });
        writeFileSync(keyPath, wallet.privateKey + "\n", { mode: 0o600 });

        const cfg = config.load();
        config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: wallet.address });

        if (isJSONMode()) {
          printJSON({ address: wallet.address, keyFile: keyPath });
        } else {
          printKeyValueBox([
            ["Address", green(wallet.address)],
            ["Key file", keyPath],
          ]);
          console.log(`  ${green("✓")} Wallet generated and saved to config`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("import <path>")
    .description("Import a wallet from a private key file")
    .action((path: string) => {
      try {
        let key: string;
        try {
          key = readFileSync(path, "utf-8").trim();
        } catch {
          throw errInvalidArgs(`Could not read key file: ${path}`);
        }

        // Verify the key is valid
        const address = getWalletAddress(key);

        const keyPath = walletKeyPath();
        mkdirSync(dirname(keyPath), { recursive: true, mode: 0o755 });
        writeFileSync(keyPath, key + "\n", { mode: 0o600 });

        const cfg = config.load();
        config.save({ ...cfg, wallet_key_file: keyPath, wallet_address: address });

        if (isJSONMode()) {
          printJSON({ address, keyFile: keyPath });
        } else {
          printKeyValueBox([
            ["Address", green(address)],
            ["Key file", keyPath],
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
