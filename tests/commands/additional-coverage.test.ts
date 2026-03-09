import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("additional command coverage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rpc parses JSON params and forwards mixed values", async () => {
    const call = vi.fn().mockResolvedValue({ ok: true });
    const printSyntaxJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      debug: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printSyntaxJSON,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerRPC } = await import("../../src/commands/rpc.js");
    const program = new Command();
    registerRPC(program);

    await program.parseAsync(
      ["node", "test", "rpc", "eth_call", '{"a":1}', "true", "latest", "7"],
      { from: "node" },
    );

    expect(call).toHaveBeenCalledWith("eth_call", [{ a: 1 }, true, "latest", 7]);
    expect(printSyntaxJSON).toHaveBeenCalledWith({ ok: true });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("chains list prints JSON payload in json mode", async () => {
    const listChains = vi.fn().mockResolvedValue([
      {
        id: "ETH_MAINNET",
        name: "Ethereum Mainnet",
        isTestnet: false,
        availability: "public",
        currency: "ETH",
      },
    ]);
    const printJSON = vi.fn();
    const exitWithError = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listChains }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      dim: (s: string) => s,
      green: (s: string) => s,
      printTable: vi.fn(),
      emptyState: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerChains } = await import("../../src/commands/chains.js");
    const program = new Command();
    registerChains(program);

    await program.parseAsync(["node", "test", "chains", "list"], { from: "node" });

    expect(listChains).toHaveBeenCalledTimes(1);
    expect(printJSON).toHaveBeenCalledWith([
      {
        id: "ETH_MAINNET",
        name: "Ethereum Mainnet",
        isTestnet: false,
        availability: "public",
        currency: "ETH",
      },
    ]);
    expect(exitWithError).not.toHaveBeenCalled();
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
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "generate"], {
      from: "node",
    });

    expect(printJSON).toHaveBeenCalledWith({
      address: "0xaddress",
      keyFile: `${tempHome}/.config/alchemy/wallet-key.txt`,
    });
    expect(exitWithError).not.toHaveBeenCalled();

    const configPath = `${tempHome}/.config/alchemy/config.json`;
    const keyPath = `${tempHome}/.config/alchemy/wallet-key.txt`;
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
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

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
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerWallet } = await import("../../src/commands/wallet.js");
    const program = new Command();
    registerWallet(program);

    await program.parseAsync(["node", "test", "wallet", "address"], {
      from: "node",
    });

    expect(printHuman).toHaveBeenCalledWith("0xaddress\n", { address: "0xaddress" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("version uses printHuman output contract", async () => {
    const printHuman = vi.fn();
    vi.doMock("../../src/lib/output.js", () => ({ printHuman }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      brand: (s: string) => s,
    }));

    const { registerVersion } = await import("../../src/commands/version.js");
    const program = new Command();
    program.version("1.2.3");
    registerVersion(program);

    await program.parseAsync(["node", "test", "version"], { from: "node" });

    expect(printHuman).toHaveBeenCalledWith("  ◆ alchemy-cli 1.2.3\n", {
      version: "1.2.3",
    });
  });

  it("setup status prints JSON contract", async () => {
    const printJSON = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "api_test" }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      printKeyValueBox: vi.fn(),
      dim: (s: string) => s,
    }));

    const { registerSetup } = await import("../../src/commands/setup.js");
    const program = new Command();
    registerSetup(program);

    await program.parseAsync(["node", "test", "setup", "status"], { from: "node" });
    expect(printJSON).toHaveBeenCalledWith({
      complete: true,
      satisfiedBy: "api_key",
      missing: [],
      nextCommands: [],
    });
  });

  it("block forwards invalid block identifiers to exitWithError", async () => {
    const exitWithError = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: vi.fn(),
      printKeyValueBox: vi.fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatBlockTimestamp: vi.fn(),
      formatHexQuantity: vi.fn(),
      formatGasSummary: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerBlock } = await import("../../src/commands/block.js");
    const program = new Command();
    registerBlock(program);

    await program.parseAsync(["node", "test", "block", "abc"], { from: "node" });
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });

  it("block latest prints JSON payload in json mode", async () => {
    const call = vi.fn().mockResolvedValue({ number: "0x10", hash: "0xhash" });
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      bold: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printKeyValueBox: vi.fn(),
      printSyntaxJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/block-format.js", () => ({
      formatBlockTimestamp: vi.fn(),
      formatHexQuantity: vi.fn(),
      formatGasSummary: vi.fn(),
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerBlock } = await import("../../src/commands/block.js");
    const program = new Command();
    registerBlock(program);

    await program.parseAsync(["node", "test", "block", "latest"], { from: "node" });
    expect(call).toHaveBeenCalledWith("eth_getBlockByNumber", ["latest", false]);
    expect(printJSON).toHaveBeenCalledWith({ number: "0x10", hash: "0xhash" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps list skips interactive pagination when --no-interactive is set", async () => {
    const listApps = vi
      .fn()
      .mockResolvedValue({
        apps: [
          {
            id: "app_1",
            name: "First App",
            apiKey: "api_1",
            webhookApiKey: "wh_1",
            chainNetworks: [],
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ],
        cursor: "cursor_2",
      });
    const promptSelect = vi.fn();
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags: () => ({ listApps }),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => false,
      printJSON: vi.fn(),
      verbose: false,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: async (
        _start: string,
        _end: string,
        fn: () => Promise<unknown>,
      ) => fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/lib/terminal-ui.js", () => ({
      promptSelect,
    }));
    vi.doMock("../../src/index.js", () => ({ exitWithError: vi.fn() }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    program.option("--no-interactive");
    registerApps(program);

    await program.parseAsync(["node", "test", "--no-interactive", "apps", "list"], {
      from: "node",
    });

    expect(listApps).toHaveBeenCalledTimes(1);
    expect(promptSelect).not.toHaveBeenCalled();
  });
});

describe("apps dry-run JSON contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function setupAppsProgram() {
    const printJSON = vi.fn();
    const exitWithError = vi.fn();
    const adminClientFromFlags = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      adminClientFromFlags,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      green: (s: string) => s,
      dim: (s: string) => s,
      withSpinner: vi.fn(),
      printTable: vi.fn(),
      printKeyValueBox: vi.fn(),
      emptyState: vi.fn(),
      maskIf: (s: string) => s,
    }));
    vi.doMock("../../src/lib/errors.js", async () => {
      const actual = await vi.importActual("../../src/lib/errors.js");
      return actual;
    });
    vi.doMock("../../src/index.js", () => ({ exitWithError }));

    const { registerApps } = await import("../../src/commands/apps.js");
    const program = new Command();
    registerApps(program);

    return { program, printJSON, exitWithError, adminClientFromFlags };
  }

  it("apps delete --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(["node", "test", "apps", "delete", "app_1", "--dry-run"], {
      from: "node",
    });
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "delete",
      payload: { id: "app_1" },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps update --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      ["node", "test", "apps", "update", "app_1", "--name", "Updated", "--dry-run"],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "update",
      payload: { id: "app_1", name: "Updated" },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps networks --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "networks",
        "app_1",
        "--networks",
        "eth-mainnet,base-mainnet",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "networks",
      payload: { id: "app_1", networks: ["eth-mainnet", "base-mainnet"] },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps address-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "address-allowlist",
        "app_1",
        "--addresses",
        "0xabc,0xdef",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "address-allowlist",
      payload: {
        id: "app_1",
        addresses: [{ value: "0xabc" }, { value: "0xdef" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps origin-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      [
        "node",
        "test",
        "apps",
        "origin-allowlist",
        "app_1",
        "--origins",
        "https://a.com,https://b.com",
        "--dry-run",
      ],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "origin-allowlist",
      payload: {
        id: "app_1",
        origins: [{ value: "https://a.com" }, { value: "https://b.com" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("apps ip-allowlist --dry-run emits expected JSON payload", async () => {
    const { program, printJSON, adminClientFromFlags, exitWithError } =
      await setupAppsProgram();
    await program.parseAsync(
      ["node", "test", "apps", "ip-allowlist", "app_1", "--ips", "1.2.3.4,5.6.7.8", "--dry-run"],
      { from: "node" },
    );
    expect(printJSON).toHaveBeenCalledWith({
      dryRun: true,
      action: "ip-allowlist",
      payload: {
        id: "app_1",
        ips: [{ value: "1.2.3.4" }, { value: "5.6.7.8" }],
      },
    });
    expect(adminClientFromFlags).not.toHaveBeenCalled();
    expect(exitWithError).not.toHaveBeenCalled();
  });
});
