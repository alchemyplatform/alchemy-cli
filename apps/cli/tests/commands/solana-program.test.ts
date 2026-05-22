import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";

const PROGRAM_ID = "11111111111111111111111111111111";
const ACCOUNT_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("solana program command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("forwards getProgramAccounts with filters and client-side limit", async () => {
    const printJSON = vi.fn();
    const call = vi.fn().mockResolvedValue([
      { pubkey: "acct-1", account: { lamports: 1, owner: PROGRAM_ID, data: ["abc", "base64"] } },
      { pubkey: "acct-2", account: { lamports: 2, owner: PROGRAM_ID, data: ["def", "base64"] } },
    ]);
    const validateSolanaAddress = vi.fn();

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveSolanaNetwork: () => "solana-devnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress,
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      printTable: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));

    const { registerSolanaProgram } = await import("../../src/commands/solana-program.js");
    const program = new Command();
    registerSolanaProgram(program);

    await program.parseAsync([
      "node",
      "test",
      "program",
      "accounts",
      PROGRAM_ID,
      "--filters",
      '[{"memcmp":{"offset":0,"bytes":"abc"}}]',
      "--encoding",
      "jsonParsed",
      "--limit",
      "1",
    ], { from: "node" });

    expect(validateSolanaAddress).toHaveBeenCalledWith(PROGRAM_ID);
    expect(call).toHaveBeenCalledWith("getProgramAccounts", [
      PROGRAM_ID,
      {
        encoding: "jsonParsed",
        filters: [{ memcmp: { offset: 0, bytes: "abc" } }],
      },
    ]);
    expect(printJSON).toHaveBeenCalledWith({
      programId: PROGRAM_ID,
      network: "solana-devnet",
      count: 2,
      accounts: [
        { pubkey: "acct-1", account: { lamports: 1, owner: PROGRAM_ID, data: ["abc", "base64"] } },
      ],
    });
  });

  it("calls getAccountInfo for account lookup", async () => {
    const printJSON = vi.fn();
    const call = vi.fn().mockResolvedValue({
      value: { lamports: 10, owner: PROGRAM_ID, executable: false, data: ["abc", "base64"] },
    });

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveSolanaNetwork: () => "solana-mainnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON,
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      printTable: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));

    const { registerSolanaProgram } = await import("../../src/commands/solana-program.js");
    const program = new Command();
    registerSolanaProgram(program);

    await program.parseAsync([
      "node",
      "test",
      "program",
      "account",
      ACCOUNT_ID,
      "--encoding",
      "base64",
    ], { from: "node" });

    expect(call).toHaveBeenCalledWith("getAccountInfo", [ACCOUNT_ID, { encoding: "base64" }]);
    expect(printJSON).toHaveBeenCalledWith({
      address: ACCOUNT_ID,
      network: "solana-mainnet",
      account: { lamports: 10, owner: PROGRAM_ID, executable: false, data: ["abc", "base64"] },
    });
  });

  it("rejects non-array filters", async () => {
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call: vi.fn() }),
      resolveSolanaNetwork: () => "solana-devnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      printTable: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));

    const { performSolanaProgramAccounts } = await import("../../src/commands/solana-program.js");
    await expect(
      performSolanaProgramAccounts({} as Command, PROGRAM_ID, { filters: '{"memcmp":{}}' }),
    ).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message: "--filters must be a JSON array.",
    });
  });

  it("adds a hint when RPC rejects broad secondary-index account scans", async () => {
    const { CLIError, ErrorCode } = await import("../../src/lib/errors.js");
    const call = vi.fn().mockRejectedValue(
      new CLIError(
        ErrorCode.RPC_ERROR,
        "RPC error -32010: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA excluded from account secondary indexes",
      ),
    );

    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveSolanaNetwork: () => "solana-devnet",
    }));
    vi.doMock("../../src/lib/validators.js", () => ({
      validateSolanaAddress: vi.fn(),
    }));
    vi.doMock("../../src/lib/output.js", () => ({
      isJSONMode: () => true,
      printJSON: vi.fn(),
    }));
    vi.doMock("../../src/lib/ui.js", () => ({
      withSpinner: async (_label: string, _doneLabel: string, fn: () => Promise<unknown>) => fn(),
      printKeyValue: vi.fn(),
      printKeyValueBox: vi.fn(),
      printTable: vi.fn(),
      green: (s: string) => s,
      dim: (s: string) => s,
    }));

    const { performSolanaProgramAccounts } = await import("../../src/commands/solana-program.js");
    await expect(
      performSolanaProgramAccounts({} as Command, ACCOUNT_ID, {}),
    ).rejects.toMatchObject({
      code: ErrorCode.RPC_ERROR,
      hint: expect.stringContaining("Add a narrow --filters JSON array"),
    });
  });
});
