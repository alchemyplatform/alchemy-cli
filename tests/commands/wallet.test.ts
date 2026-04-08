import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("wallet command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("wallet generate writes key/config and emits JSON", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const originalHome = process.env.HOME;
    const originalXdg = process.env.XDG_CONFIG_HOME;
    const originalAlchemyCfg = process.env.ALCHEMY_CONFIG;
    const tempHome = mkdtempSync(join(tmpdir(), "alchemy-wallet-test-"));
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.ALCHEMY_CONFIG;

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: () => "0xwallet",
      privateKeyToAccount: (key: string) => ({ address: key === "0xwallet" ? "0xaddress" : "0xunknown" }),
    }));
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Uint8Array.from({ length: bytes.length }, (_, i) => i));
        return bytes;
      },
      subtle: {
        ...globalThis.crypto.subtle,
        exportKey: async () => Uint8Array.from({ length: 32 }, (_, i) => i + 32).buffer,
      },
    });
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
      }),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "generate"], {
      from: "node",
    });

    const printed = printJSON.mock.calls[0]?.[0] as {
      evm: { address: string; keyFile: string };
      solana: { address: string; keyFile: string };
    };
    expect(printed.evm).toMatchObject({ address: "0xaddress" });
    expect(printed.evm.keyFile).toMatch(
      new RegExp(`${tempHome}/\\.config/alchemy/wallet-keys/wallet-key-[a-z0-9]{1,12}-\\d+-[a-f0-9]{8}\\.txt$`),
    );
    expect(printed.solana).toMatchObject({ address: "SoLaNaAdDrEsS123" });
    expect(printed.solana.keyFile).toMatch(
      new RegExp(`${tempHome}/\\.config/alchemy/wallet-keys/solana-wallet-key-[a-z0-9]{1,12}-\\d+-[a-f0-9]{8}\\.txt$`),
    );
    expect(exitWithError).not.toHaveBeenCalled();

    const configPath = `${tempHome}/.config/alchemy/config.json`;
    expect(existsSync(configPath)).toBe(true);
    const configJSON = JSON.parse(readFileSync(configPath, "utf-8")) as {
      wallet_key_file: string;
      wallet_address: string;
      solana_wallet_key_file: string;
      solana_wallet_address: string;
    };
    expect(configJSON.wallet_address).toBe("0xaddress");
    expect(configJSON.solana_wallet_address).toBe("SoLaNaAdDrEsS123");
    const solanaKey = JSON.parse(readFileSync(configJSON.solana_wallet_key_file, "utf-8")) as number[];
    expect(solanaKey).toHaveLength(64);
    expect(solanaKey.slice(0, 4)).toEqual([0, 1, 2, 3]);

    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalAlchemyCfg === undefined) delete process.env.ALCHEMY_CONFIG;
    else process.env.ALCHEMY_CONFIG = originalAlchemyCfg;
  });

  it("wallet create writes key/config and emits JSON", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const originalHome = process.env.HOME;
    const originalXdg = process.env.XDG_CONFIG_HOME;
    const originalAlchemyCfg = process.env.ALCHEMY_CONFIG;
    const tempHome = mkdtempSync(join(tmpdir(), "alchemy-wallet-test-"));
    process.env.HOME = tempHome;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.ALCHEMY_CONFIG;

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: () => "0xwallet",
      privateKeyToAccount: (key: string) => ({ address: key === "0xwallet" ? "0xaddress" : "0xunknown" }),
    }));
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Uint8Array.from({ length: bytes.length }, (_, i) => i));
        return bytes;
      },
      subtle: {
        ...globalThis.crypto.subtle,
        exportKey: async () => Uint8Array.from({ length: 32 }, (_, i) => i + 32).buffer,
      },
    });
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
      }),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "create"], {
      from: "node",
    });

    const printed = printJSON.mock.calls[0]?.[0] as {
      evm: { address: string; keyFile: string };
      solana: { address: string; keyFile: string };
    };
    expect(printed.evm).toMatchObject({ address: "0xaddress" });
    expect(printed.solana).toMatchObject({ address: "SoLaNaAdDrEsS123" });
    expect(exitWithError).not.toHaveBeenCalled();

    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalAlchemyCfg === undefined) delete process.env.ALCHEMY_CONFIG;
    else process.env.ALCHEMY_CONFIG = originalAlchemyCfg;
  });

  it("wallet import forwards read failures to exitWithError", async () => {
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("no file");
      },
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: vi.fn(),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: vi.fn(),
      createKeyPairSignerFromBytes: vi.fn(),
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

  it("wallet address prints both EVM and Solana addresses", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: () => ({ address: "0xaddress" }),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
      }),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "address"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      evm: "0xaddress",
      solana: "SoLaNaAdDrEsS123",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet address supports legacy hex Solana keys", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: () => "a".repeat(64),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: vi.fn(),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "address"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      evm: null,
      solana: "SoLaNaAdDrEsS123",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet qr supports --type solana", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: () => ({ address: "0xaddress" }),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
      }),
    }));
    vi.doMock("qrcode", () => ({
      default: { toString: vi.fn() },
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "qr", "--type", "solana"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      type: "solana",
      address: "SoLaNaAdDrEsS123",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet qr prompts for type in interactive mode", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const promptSelect = vi.fn().mockResolvedValue("solana");

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: () => ({ address: "0xaddress" }),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
      }),
    }));
    vi.doMock("qrcode", () => ({
      default: { toString: vi.fn() },
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "qr"], {
      from: "node",
    });

    expect(promptSelect).toHaveBeenCalledWith(expect.objectContaining({
      message: "Select wallet for QR code",
    }));
    expect(printJSON).toHaveBeenCalledWith({
      type: "solana",
      address: "SoLaNaAdDrEsS123",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet create cleans up partial files when Solana persistence fails", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const writeFileSync = vi.fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("disk full");
      });
    const rmSync = vi.fn();
    const save = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync,
      mkdirSync: vi.fn(),
      rmSync,
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save,
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: () => "0xwallet",
      privateKeyToAccount: (key: string) => ({ address: key === "0xwallet" ? "0xaddress" : "0xunknown" }),
    }));
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Uint8Array.from({ length: bytes.length }, (_, i) => i));
        return bytes;
      },
      subtle: {
        ...globalThis.crypto.subtle,
        exportKey: async () => Uint8Array.from({ length: 32 }, (_, i) => i + 32).buffer,
      },
    });
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: async () => ({
        address: "SoLaNaAdDrEsS123",
        keyPair: { publicKey: "mock-public-key" },
      }),
      createKeyPairSignerFromBytes: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({ ...(await vi.importActual("../../src/lib/errors.js")), exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "create"], {
      from: "node",
    });

    expect(printJSON).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(rmSync.mock.calls[0]?.[0]).toContain("/tmp/alchemy/wallet-keys/wallet-key-");
  });
});
