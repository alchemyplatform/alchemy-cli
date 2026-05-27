import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { ErrorCode } from "../../src/lib/errors.js";

function makeProgram(
  opts: Record<string, unknown> = {},
  globalOpts?: Record<string, unknown>,
): Command {
  return {
    opts: () => opts,
    ...(globalOpts ? { optsWithGlobals: () => globalOpts } : {}),
  } as unknown as Command;
}

describe("resolve.ts precedence", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("resolveAPIKey order: flag > env > config > app api key", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "cfg-key", app: { apiKey: "app-key" } }),
    }));
    const { resolveAPIKey } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_API_KEY = "env-key";
    expect(resolveAPIKey(makeProgram({ apiKey: "flag-key" }))).toBe("flag-key");
    expect(resolveAPIKey(makeProgram({}))).toBe("env-key");

    delete process.env.ALCHEMY_API_KEY;
    expect(resolveAPIKey(makeProgram({}))).toBe("cfg-key");

    vi.resetModules();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ app: { apiKey: "app-fallback-key" } }),
    }));
    const { resolveAPIKey: resolveAPIKey2 } = await import("../../src/lib/resolve.js");
    expect(resolveAPIKey2(makeProgram({}))).toBe("app-fallback-key");
  });

  it("adminClientFromFlags uses auth token", async () => {
    const adminCtor = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ auth_token: "cfg-auth" }),
    }));
    vi.doMock("../../src/lib/admin-client.js", () => ({
      AdminClient: class {
        constructor(...args: unknown[]) {
          adminCtor(...args);
        }
      },
    }));
    const { adminClientFromFlags } = await import("../../src/lib/resolve.js");

    adminClientFromFlags(makeProgram({}));

    expect(adminCtor).toHaveBeenCalledWith({ type: "auth_token", token: "cfg-auth" });
  });

  it("adminClientFromFlags requires auth token", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { adminClientFromFlags } = await import("../../src/lib/resolve.js");

    expect(() => adminClientFromFlags(makeProgram({}))).toThrow(
      expect.objectContaining({ code: ErrorCode.AUTH_REQUIRED }),
    );
  });

  it("resolveAPIKey reads root flags from nested commands", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveAPIKey } = await import("../../src/lib/resolve.js");

    expect(
      resolveAPIKey(makeProgram({}, { apiKey: "root-flag-key" })),
    ).toBe("root-flag-key");
  });

  it("resolveRequiredNetwork requires a flag", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ network: "cfg-network" }),
    }));
    const { resolveNetwork, resolveRequiredNetwork } = await import("../../src/lib/resolve.js");

    expect(resolveNetwork(makeProgram({ network: "flag-network" }))).toBe("flag-network");
    expect(resolveRequiredNetwork(makeProgram({ network: "flag-network" }))).toBe("flag-network");
    expect(resolveRequiredNetwork(makeProgram({}, { network: "root-network" }))).toBe("root-network");
    expect(() => resolveRequiredNetwork(makeProgram({}))).toThrow(
      expect.objectContaining({
        code: ErrorCode.INVALID_ARGS,
        message: expect.stringContaining("Network required"),
      }),
    );
  });

  it("resolveRequiredNetwork does not fall back to eth-mainnet", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ network: "cfg-network" }),
    }));
    const { resolveRequiredNetwork } = await import("../../src/lib/resolve.js");

    let thrown: unknown;
    try {
      resolveRequiredNetwork(makeProgram({}));
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toMatchObject({
      code: ErrorCode.INVALID_ARGS,
      message: expect.stringContaining("Network required"),
    });
  });

  it("resolveSolanaNetwork requires a flag with a Solana network-list hint", async () => {
    const { resolveSolanaNetwork } = await import("../../src/lib/resolve.js");

    expect(resolveSolanaNetwork(makeProgram({ network: "solana-mainnet" }))).toBe(
      "solana-mainnet",
    );
    expect(resolveSolanaNetwork(makeProgram({}, { network: "solana-devnet" }))).toBe(
      "solana-devnet",
    );
    expect(() => resolveSolanaNetwork(makeProgram({}))).toThrow(
      expect.objectContaining({
        code: ErrorCode.INVALID_ARGS,
        message: expect.stringContaining("Network required"),
        hint: "alchemy solana network list",
      }),
    );
  });

  it("resolveWalletKey order: --wallet-key-file > env > config wallet_key_file", async () => {
    const readFileSync = vi.fn((path: string) => {
      if (path === "/flag/key.txt") return "flag-key\n";
      if (path === "/cfg/key.txt") return "cfg-key\n";
      return "";
    });
    vi.doMock("node:fs", () => ({ readFileSync }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ wallet_key_file: "/cfg/key.txt" }),
    }));
    const { resolveWalletKey } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_WALLET_KEY = "env-wallet";
    expect(resolveWalletKey(makeProgram({ walletKeyFile: "/flag/key.txt" }))).toBe("flag-key");
    expect(resolveWalletKey(makeProgram({}))).toBe("env-wallet");
    delete process.env.ALCHEMY_WALLET_KEY;
    expect(resolveWalletKey(makeProgram({}))).toBe("cfg-key");
  });

  it("resolveX402 is true from flag or config", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ x402: true }),
    }));
    const { resolveX402 } = await import("../../src/lib/resolve.js");

    expect(resolveX402(makeProgram({ x402: true }))).toBe(true);
    expect(resolveX402(makeProgram({}))).toBe(true);
  });

  it("clientFromFlags chooses X402Client when x402 enabled", async () => {
    const x402Ctor = vi.fn();
    const clientCtor = vi.fn();
    vi.doMock("node:fs", () => ({
      readFileSync: () => "wallet-key-from-file\n",
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ x402: true, wallet_key_file: "/wallet/key.txt" }),
    }));
    vi.doMock("../../src/lib/x402-client.js", () => ({
      X402Client: class {
        constructor(...args: unknown[]) {
          x402Ctor(...args);
        }
      },
    }));
    vi.doMock("../../src/lib/client.js", () => ({
      Client: class {
        constructor(...args: unknown[]) {
          clientCtor(...args);
        }
      },
    }));

    const { clientFromFlags } = await import("../../src/lib/resolve.js");
    clientFromFlags(makeProgram({ network: "base-mainnet" }));

    expect(x402Ctor).toHaveBeenCalledWith("wallet-key-from-file", "base-mainnet");
    expect(clientCtor).not.toHaveBeenCalled();
  });

  it("apiKeyClientFromFlags uses API-key auth even when x402 is enabled", async () => {
    const x402Ctor = vi.fn();
    const clientCtor = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ x402: true, api_key: "cfg-api-key" }),
    }));
    vi.doMock("../../src/lib/x402-client.js", () => ({
      X402Client: class {
        constructor(...args: unknown[]) {
          x402Ctor(...args);
        }
      },
    }));
    vi.doMock("../../src/lib/client.js", () => ({
      Client: class {
        constructor(...args: unknown[]) {
          clientCtor(...args);
        }
      },
    }));

    const { apiKeyClientFromFlags } = await import("../../src/lib/resolve.js");
    apiKeyClientFromFlags(makeProgram({ network: "base-mainnet" }));

    expect(clientCtor).toHaveBeenCalledWith("cfg-api-key", "base-mainnet");
    expect(x402Ctor).not.toHaveBeenCalled();
  });

  it("clientFromFlags chooses Client when x402 disabled", async () => {
    const x402Ctor = vi.fn();
    const clientCtor = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ api_key: "cfg-api-key" }),
    }));
    vi.doMock("../../src/lib/x402-client.js", () => ({
      X402Client: class {
        constructor(...args: unknown[]) {
          x402Ctor(...args);
        }
      },
    }));
    vi.doMock("../../src/lib/client.js", () => ({
      Client: class {
        constructor(...args: unknown[]) {
          clientCtor(...args);
        }
      },
    }));

    const { clientFromFlags } = await import("../../src/lib/resolve.js");
    clientFromFlags(makeProgram({ network: "eth-mainnet" }));

    expect(clientCtor).toHaveBeenCalledWith("cfg-api-key", "eth-mainnet");
    expect(x402Ctor).not.toHaveBeenCalled();
  });

  it("clientFromFlags uses root global opts for nested commands", async () => {
    const clientCtor = vi.fn();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    vi.doMock("../../src/lib/x402-client.js", () => ({
      X402Client: class {},
    }));
    vi.doMock("../../src/lib/client.js", () => ({
      Client: class {
        constructor(...args: unknown[]) {
          clientCtor(...args);
        }
      },
    }));

    const { clientFromFlags } = await import("../../src/lib/resolve.js");
    clientFromFlags(makeProgram({}, { apiKey: "root-api-key", network: "base-mainnet" }));

    expect(clientCtor).toHaveBeenCalledWith("root-api-key", "base-mainnet");
  });

  it("resolveGasSponsored order: flag > EVM env > EVM config", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ evm_gas_sponsored: true }),
    }));
    const { resolveGasSponsored } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_EVM_GAS_SPONSORED = "false";
    expect(resolveGasSponsored(makeProgram({ gasSponsored: true }))).toBe(true);
    expect(resolveGasSponsored(makeProgram({}))).toBe(false);
    delete process.env.ALCHEMY_EVM_GAS_SPONSORED;
    expect(resolveGasSponsored(makeProgram({}))).toBe(true);

    vi.resetModules();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveGasSponsored: resolveGasSponsoredDefault } = await import("../../src/lib/resolve.js");
    expect(resolveGasSponsoredDefault(makeProgram({}))).toBe(false);
  });

  it("resolveGasPolicyId order: flag > EVM env > EVM config", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ evm_gas_policy_id: "evm-cfg-policy" }),
    }));
    const { resolveGasPolicyId } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_EVM_GAS_POLICY_ID = "evm-env-policy";
    expect(resolveGasPolicyId(makeProgram({ gasPolicyId: "flag-policy" }))).toBe("flag-policy");
    expect(resolveGasPolicyId(makeProgram({}))).toBe("evm-env-policy");
    delete process.env.ALCHEMY_EVM_GAS_POLICY_ID;
    expect(resolveGasPolicyId(makeProgram({}))).toBe("evm-cfg-policy");

    vi.resetModules();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveGasPolicyId: resolveGasPolicyIdDefault } = await import("../../src/lib/resolve.js");
    expect(resolveGasPolicyIdDefault(makeProgram({}))).toBeUndefined();
  });

  it("resolveSolanaFeeSponsored order: flag > Solana env > Solana config", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ solana_fee_sponsored: true }),
    }));
    const { resolveSolanaFeeSponsored } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_SOLANA_FEE_SPONSORED = "false";
    expect(resolveSolanaFeeSponsored(makeProgram({ feeSponsored: true }))).toBe(true);
    expect(resolveSolanaFeeSponsored(makeProgram({}))).toBe(false);
    delete process.env.ALCHEMY_SOLANA_FEE_SPONSORED;
    expect(resolveSolanaFeeSponsored(makeProgram({}))).toBe(true);

    vi.resetModules();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveSolanaFeeSponsored: resolveSolanaFeeSponsoredNoFallback } = await import("../../src/lib/resolve.js");
    expect(resolveSolanaFeeSponsoredNoFallback(makeProgram({}))).toBe(false);
  });

  it("resolveSolanaFeePolicyId order: flag > Solana env > Solana config", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ solana_fee_policy_id: "solana-cfg-policy" }),
    }));
    const { resolveSolanaFeePolicyId } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_SOLANA_FEE_POLICY_ID = "solana-env-policy";
    expect(resolveSolanaFeePolicyId(makeProgram({ feePolicyId: "flag-policy" }))).toBe("flag-policy");
    expect(resolveSolanaFeePolicyId(makeProgram({}))).toBe("solana-env-policy");
    delete process.env.ALCHEMY_SOLANA_FEE_POLICY_ID;
    expect(resolveSolanaFeePolicyId(makeProgram({}))).toBe("solana-cfg-policy");

    vi.resetModules();
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveSolanaFeePolicyId: resolveSolanaFeePolicyIdNoFallback } = await import("../../src/lib/resolve.js");
    expect(resolveSolanaFeePolicyIdNoFallback(makeProgram({}))).toBeUndefined();
  });

  it("resolveActiveSigner order: flag > env > config > legacy env", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ active_signer: "local" }),
    }));
    const { resolveActiveSigner } = await import("../../src/lib/resolve.js");

    process.env.ALCHEMY_ACTIVE_SIGNER = "session";
    expect(resolveActiveSigner(makeProgram({ signer: "local" }))).toBe("local");
    expect(resolveActiveSigner(makeProgram({}))).toBe("session");
    delete process.env.ALCHEMY_ACTIVE_SIGNER;
    expect(resolveActiveSigner(makeProgram({}))).toBe("local");
  });

  it("resolveActiveSigner returns undefined when nothing is set", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveActiveSigner } = await import("../../src/lib/resolve.js");

    delete process.env.ALCHEMY_ACTIVE_SIGNER;
    delete process.env.ALCHEMY_DELEGATED_WALLET;
    expect(resolveActiveSigner(makeProgram({}))).toBeUndefined();
  });

  it("resolveActiveSigner maps legacy ALCHEMY_DELEGATED_WALLET=true to 'session'", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({}),
    }));
    const { resolveActiveSigner } = await import("../../src/lib/resolve.js");

    delete process.env.ALCHEMY_ACTIVE_SIGNER;
    process.env.ALCHEMY_DELEGATED_WALLET = "true";
    expect(resolveActiveSigner(makeProgram({}))).toBe("session");
    delete process.env.ALCHEMY_DELEGATED_WALLET;
  });

  it("resolveDelegatedMode (deprecated alias) returns true only for explicit session preference", async () => {
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ active_signer: "session" }),
    }));
    const { resolveDelegatedMode } = await import("../../src/lib/resolve.js");

    delete process.env.ALCHEMY_ACTIVE_SIGNER;
    delete process.env.ALCHEMY_DELEGATED_WALLET;
    expect(resolveDelegatedMode(makeProgram({}))).toBe(true);
  });

  it("clientFromFlags throws AUTH_REQUIRED when x402 is enabled without wallet key", async () => {
    vi.doMock("node:fs", () => ({
      readFileSync: () => "",
    }));
    vi.doMock("../../src/lib/config.js", () => ({
      load: () => ({ x402: true }),
    }));
    const { clientFromFlags } = await import("../../src/lib/resolve.js");

    await expect(async () => clientFromFlags(makeProgram({ network: "eth-mainnet" }))).rejects.toMatchObject({
      code: ErrorCode.AUTH_REQUIRED,
    });
  });
});
