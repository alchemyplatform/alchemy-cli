import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("wallet command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("wallet generate writes key/config and emits JSON", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const originalHome = process.env.HOME;
    const tempHome = mkdtempSync(join(tmpdir(), "alchemy-wallet-test-"));
    process.env.HOME = tempHome;

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("@alchemy/x402", () => ({
      generateWallet: () => ({
        privateKey: "0xwallet",
        address: "0xaddress",
      }),
      getWalletAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "generate"], {
      from: "node",
    });

    const printedWallet = printJSON.mock.calls[0]?.[0] as {
      address: string;
      keyFile: string;
    };
    expect(printedWallet).toMatchObject({ address: "0xaddress" });
    expect(printedWallet.keyFile).toMatch(
      new RegExp(`${tempHome}/\\.config/alchemy/wallet-keys/wallet-key-[a-z0-9]{1,12}-\\d+-[a-f0-9]{8}\\.txt$`),
    );
    expect(exitWithError).not.toHaveBeenCalled();

    const configPath = `${tempHome}/.config/alchemy/config.json`;
    const keyPath = printedWallet.keyFile;
    expect(existsSync(configPath)).toBe(true);
    expect(existsSync(keyPath)).toBe(true);
    const configJSON = JSON.parse(readFileSync(configPath, "utf-8")) as {
      wallet_key_file: string;
      wallet_address: string;
    };
    expect(configJSON.wallet_key_file).toBe(keyPath);
    expect(configJSON.wallet_address).toBe("0xaddress");

    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it("wallet import forwards read failures to exitWithError", async () => {
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("no file");
      },
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("@alchemy/x402", () => ({
      generateWallet: vi.fn(),
      getWalletAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "import", "/bad/path"], {
      from: "node",
    });

    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("wallet address prints resolved address", async () => {
    const printHuman = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      printHuman,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("@alchemy/x402", () => ({
      generateWallet: vi.fn(),
      getWalletAddress: () => "0xaddress",
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "address"], {
      from: "node",
    });

    expect(printHuman).toHaveBeenCalledWith("0xaddress\n", { address: "0xaddress" });
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
