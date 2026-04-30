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

  it("wallet connect --mode local writes key/config and emits JSON", async () => {
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
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
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

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "local", "--chain", "both"], {
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

  it("wallet connect --mode local can create local wallets", async () => {
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
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
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

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "local", "--chain", "both"], {
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

  it("wallet connect --mode local --import forwards read failures to exitWithError", async () => {
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: () => {
        throw new Error("no file");
      },
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
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

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "local", "--import", "/bad/path"], {
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
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      evm: "0xaddress",
      solana: "SoLaNaAdDrEsS123",
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet address reports activeSigner from resolveActiveSigner precedence", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ active_signer: "session" }),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => ({ evmAddress: "0xsession" }),
      resolveActiveSigner: () => "local",
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
      createKeyPairSignerFromPrivateKeyBytes: vi.fn(),
      createKeyPairSignerFromBytes: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "address"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      evm: "0xaddress",
      activeSigner: "local",
    }));
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
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("node:os", () => ({ homedir: () => "/tmp/home" }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: () => "a".repeat(64),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      evm: null,
      solana: "SoLaNaAdDrEsS123",
    }));
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
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => false,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
      promptConfirm: vi.fn(),
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
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save: vi.fn(),
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: () => JSON.stringify(Array.from({ length: 64 }, (_, i) => i)),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect,
      promptConfirm: vi.fn(),
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

  it("wallet connect creates, approves, and stores a delegated session", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const openBrowser = vi.fn();
    const createRemoteWalletSession = vi.fn().mockResolvedValue({
      sessionId: "remote-session",
      approvalUrl: "https://dashboard.alchemy.com/approve",
      expiresAt: "2026-04-21T00:00:00.000Z",
    });
    const getRemoteWalletSession = vi.fn().mockResolvedValue({
      sessionId: "remote-session",
      status: "approved",
      privyAppId: "privy-app",
      walletId: "wallet-123",
      address: "0xabc123",
      chainType: "evm",
      capabilities: {
        "evm.signMessage": true,
        "evm.signTypedData": true,
        "evm.signAuthorization": true,
      },
      expiresAt: "2026-04-21T00:00:00.000Z",
    });
    const updateSession = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/auth.js", () => ({
      openBrowser,
    }));
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession,
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession,
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: () => ({
        sessionId: "local-session",
        status: "pending",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      loadSession: () => null,
      clearSession: vi.fn(),
      updateSession,
      isSessionValid: vi.fn(),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
      promptConfirm: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "session"], {
      from: "node",
    });

    expect(createRemoteWalletSession).toHaveBeenCalledWith("auth-token", expect.objectContaining({
      requestSignerVersion: "v1",
      chainType: "evm",
      capabilities: {
        "evm.signMessage": true,
        "evm.signTypedData": true,
        "evm.signAuthorization": true,
      },
    }));
    expect(getRemoteWalletSession).toHaveBeenCalledWith("auth-token", "remote-session");
    expect(openBrowser).toHaveBeenCalledWith("https://dashboard.alchemy.com/approve");
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({
      status: "approved",
      walletId: "wallet-123",
      evmWalletId: "wallet-123",
      evmAddress: "0xabc123",
      privyAppId: "privy-app",
    }));
    expect(printJSON).toHaveBeenCalledWith({
      sessionId: "remote-session",
      status: "approved",
      privyAppId: "privy-app",
      walletId: "wallet-123",
      evmAddress: "0xabc123",
      evmWalletId: "wallet-123",
      chainType: "evm",
      capabilities: {
        "evm.signMessage": true,
        "evm.signTypedData": true,
        "evm.signAuthorization": true,
      },
      expiresAt: "2026-04-21T00:00:00.000Z",
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet connect cancels cleanly when the user declines to replace an existing session", async () => {
    const exitWithError = vi.fn();
    const createRemoteWalletSession = vi.fn();
    const clearSession = vi.fn();
    const promptConfirm = vi.fn().mockResolvedValue(false);

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      printHuman: vi.fn(),
    }));
    vi.doMock("../../src/lib/interaction.js", () => ({
      isInteractiveAllowed: () => true,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      printKeyValueBox: vi.fn(),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
      promptConfirm,
    }));
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession,
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: () => ({
        sessionId: "existing-session",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      clearSession,
      updateSession: vi.fn(),
      isSessionValid: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "session"], {
      from: "node",
    });

    expect(promptConfirm).toHaveBeenCalledTimes(1);
    expect(createRemoteWalletSession).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet connect clears the local pending session if session creation fails", async () => {
    const exitWithError = vi.fn();
    const clearSession = vi.fn();
    const createRemoteWalletSession = vi.fn().mockRejectedValue(new Error("backend down"));

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/auth.js", () => ({
      openBrowser: vi.fn(),
    }));
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession,
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: () => ({
        sessionId: "local-session",
        status: "pending",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      loadSession: () => null,
      clearSession,
      updateSession: vi.fn(),
      isSessionValid: vi.fn(),
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect: vi.fn(),
      promptConfirm: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "session"], {
      from: "node",
    });

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("wallet status reports delegated wallet metadata", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
        evmAddress: "0xabc123",
        backendBaseUrl: "https://dashboard.alchemy.com/api",
        capabilities: {
          "evm.signMessage": true,
          "evm.signTypedData": true,
        },
        environment: {
          platform: "darwin",
          arch: "arm64",
          nodeVersion: "v22.14.0",
          interactive: true,
        },
      }),
      isSessionValid: () => true,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "status"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress: "0xabc123",
      status: "active",
      environment: "dashboard.alchemy.com",
      signerCapabilities: ["evm.signMessage", "evm.signTypedData"],
      verified: false,
      remoteStatus: null,
      valid: true,
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet status reports effective signer precedence and env-backed local keys", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ active_signer: "session" }),
      save: vi.fn(),
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
        evmAddress: "0xsession",
      }),
      resolveActiveSigner: () => "local",
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
        evmAddress: "0xsession",
      }),
      isSessionValid: () => true,
    }));
    vi.doMock("viem/accounts", () => ({
      generatePrivateKey: vi.fn(),
      privateKeyToAccount: () => ({ address: "0xlocal" }),
    }));
    vi.doMock("@solana/kit", () => ({
      createKeyPairSignerFromPrivateKeyBytes: vi.fn(),
      createKeyPairSignerFromBytes: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "status"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      activeSigner: "local",
      localEvm: { address: "0xlocal", keyFile: null },
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet status reports expired when local session is no longer valid", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-14T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      isSessionValid: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "status"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      status: "expired",
      verified: false,
      remoteStatus: null,
      valid: false,
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet status maps pending sessions to none", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "pending",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      isSessionValid: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "status"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      status: "none",
      verified: false,
      remoteStatus: null,
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet status --verify checks backend session state", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const saveSession = vi.fn();
    const getRemoteWalletSession = vi.fn().mockResolvedValue({
      sessionId: "session-123",
      status: "revoked",
      expiresAt: "2099-04-21T00:00:00.000Z",
      walletId: "wallet-123",
      evmAddress: "0xdef456",
      chainType: "evm",
      capabilities: {
        "evm.signMessage": true,
      },
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
      resolveActiveSigner: vi.fn(),
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession,
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession: vi.fn(),
      updateSession: vi.fn(),
      saveSession,
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
        evmAddress: "0xabc123",
      }),
      isSessionValid: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "status", "--verify"], {
      from: "node",
    });

    expect(getRemoteWalletSession).toHaveBeenCalledWith("auth-token", "session-123");
    expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({
      status: "revoked",
      evmAddress: "0xdef456",
      walletId: "wallet-123",
    }));
    expect(printJSON).toHaveBeenCalledWith(expect.objectContaining({
      status: "expired",
      verified: true,
      remoteStatus: "revoked",
      walletAddress: "0xdef456",
    }));
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet disconnect revokes backend session and clears local state", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const clearSession = vi.fn(() => true);
    const disconnectRemoteWalletSession = vi.fn().mockResolvedValue({
      alreadyDisconnected: false,
      status: null,
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession,
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession,
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      isSessionValid: () => true,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "disconnect"], {
      from: "node",
    });

    expect(disconnectRemoteWalletSession).toHaveBeenCalledWith("auth-token", "session-123");
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith({
      disconnected: true,
      revoked: true,
      alreadyDisconnected: false,
      remoteStatus: null,
      backendRevokeAttempted: true,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet disconnect handles already revoked backend sessions", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const clearSession = vi.fn(() => true);
    const disconnectRemoteWalletSession = vi.fn().mockResolvedValue({
      alreadyDisconnected: true,
      status: "revoked",
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession,
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession,
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "expired",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2026-04-14T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      isSessionValid: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "disconnect"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      disconnected: true,
      revoked: false,
      alreadyDisconnected: true,
      remoteStatus: "revoked",
      backendRevokeAttempted: true,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet disconnect clears local state without auth token", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const clearSession = vi.fn(() => true);
    const disconnectRemoteWalletSession = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => undefined,
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession,
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession,
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      isSessionValid: () => true,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "disconnect"], {
      from: "node",
    });

    expect(disconnectRemoteWalletSession).not.toHaveBeenCalled();
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith({
      disconnected: true,
      revoked: false,
      alreadyDisconnected: false,
      remoteStatus: null,
      backendRevokeAttempted: false,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet disconnect returns false when no stored session exists", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const clearSession = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn(),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: vi.fn(),
      clearSession,
      updateSession: vi.fn(),
      saveSession: vi.fn(),
      loadStoredSession: () => null,
      isSessionValid: () => false,
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "disconnect"], {
      from: "node",
    });

    expect(clearSession).not.toHaveBeenCalled();
    expect(printJSON).toHaveBeenCalledWith({
      disconnected: false,
      revoked: false,
      alreadyDisconnected: false,
      remoteStatus: null,
    });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("wallet connect --mode local cleans up partial files when Solana persistence fails", async () => {
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
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save,
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
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

    await program.parseAsync(["node", "test", "wallet", "connect", "--mode", "local", "--chain", "both"], {
      from: "node",
    });

    expect(printJSON).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(rmSync).toHaveBeenCalledTimes(1);
    expect(rmSync.mock.calls[0]?.[0]).toContain("/tmp/alchemy/wallet-keys/wallet-key-");
  });

  it("wallet use session rejects when no valid session exists", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const save = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save,
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: () => "0xwallet",
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => null,
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
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "use", "session"], {
      from: "node",
    });

    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("wallet use local rejects when no local EVM key is configured", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const save = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
      save,
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => ({ evmAddress: "0xabc" }),
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
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "use", "local"], {
      from: "node",
    });

    expect(exitWithError).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it("wallet use session writes active_signer when a session exists", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const save = vi.fn();

    vi.doMock("node:fs", () => ({
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      existsSync: vi.fn(() => false),
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "k" }),
      save,
      configDir: () => "/tmp/alchemy",
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: vi.fn(),
      resolveWalletSession: () => ({ evmAddress: "0xabc" }),
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
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "use", "session"], {
      from: "node",
    });

    expect(exitWithError).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ active_signer: "session" }));
    expect(printJSON).toHaveBeenCalledWith({ activeSigner: "session" });
  });

  it("wallet disconnect clears active_signer when it was session", async () => {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const clearSession = vi.fn(() => true);
    const save = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      resolveWalletKey: vi.fn(),
      resolveSolanaWalletKey: vi.fn(),
      resolveAuthToken: () => "auth-token",
      resolveWalletSession: () => null,
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ active_signer: "session", api_key: "k" }),
      save,
      configDir: () => "/tmp/alchemy",
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
    vi.doMock("../../src/lib/wallet-api.js", () => ({
      createRemoteWalletSession: vi.fn(),
      disconnectRemoteWalletSession: vi.fn().mockResolvedValue({
        alreadyDisconnected: false,
        status: null,
      }),
      getRemoteWalletSession: vi.fn(),
      getWalletApiBaseUrl: () => "https://dashboard.alchemy.com/api",
    }));
    vi.doMock("../../src/lib/wallet-session.js", () => ({
      createPendingSession: vi.fn(),
      loadSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      loadStoredSession: () => ({
        sessionId: "session-123",
        status: "approved",
        createdAt: "2026-04-14T00:00:00.000Z",
        expiresAt: "2099-04-21T00:00:00.000Z",
        envelopeVersion: "v1",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        privateKeyPem: "pem",
      }),
      clearSession,
      updateSession: vi.fn(),
      isSessionValid: () => true,
      saveSession: vi.fn(),
    }));
    vi.doMock("../../src/lib/errors.js", async () => ({
      ...(await vi.importActual("../../src/lib/errors.js")),
      exitWithError,
    }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "disconnect"], {
      from: "node",
    });

    expect(clearSession).toHaveBeenCalled();
    // Active signer cleared — the config.save with the stripped payload should
    // have been called with no active_signer key.
    const savedPayloads = save.mock.calls.map((c) => c[0]);
    const stripped = savedPayloads.find((p) => !("active_signer" in p));
    expect(stripped).toBeDefined();
    expect(stripped).not.toHaveProperty("active_signer");
  });
});
