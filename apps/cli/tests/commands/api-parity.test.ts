import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi, type Mock } from "vitest";
import {
  DATA_API_SURFACE,
  DATA_API_TOOL_NAMES,
  RPC_API_SURFACE,
  RPC_API_TOOL_NAMES,
  type DataApiSurfaceMethod,
  type RpcApiSurfaceMethod,
} from "@alchemy/sdk";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function mcpToolNames(file: string): string[] {
  const source = stripComments(readFileSync(join(REPO_ROOT, file), "utf8"));
  return [...source.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"/g)].map((match) => match[1]);
}

function mcpRpcSurface(): Array<{ name: string; rpcMethod: string }> {
  const source = stripComments(readFileSync(join(REPO_ROOT, "apps/mcp-server/src/tools/rpc.ts"), "utf8"));
  const blocks = [...source.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"([\s\S]*?)(?=\n\s*server\.tool\(|\n}\s*$)/g)];
  return blocks.map((block) => {
    const name = block[1];
    const body = block[2];
    const call = body.match(/mcpRpcClient\.(?:networkRpcCall|globalRpcCall)\((?:\s*network,\s*)?apiKey,\s*"([^"]+)"/s);
    if (!call) {
      throw new Error(`Missing RPC method mapping for ${name}`);
    }
    return { name, rpcMethod: call[1] };
  });
}

function mcpDataSurface(): Array<{ name: string; service: string; sdkMethod: string }> {
  const source = stripComments(readFileSync(join(REPO_ROOT, "apps/mcp-server/src/tools/data.ts"), "utf8"));
  const blocks = [...source.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"([\s\S]*?)(?=\n\s*server\.tool\(|\n}\s*$)/g)];
  return blocks.map((block) => {
    const name = block[1];
    const body = block[2];
    const call = body.match(/\.create\(apiKey\)\.(nft|prices|portfolio)\.([A-Za-z0-9_]+)\(/);
    if (!call) {
      throw new Error(`Missing Data API method mapping for ${name}`);
    }
    return { name, service: call[1], sdkMethod: call[2] };
  });
}

function commandNames(command: Command): string[] {
  return command.commands.map((subcommand) => subcommand.name());
}

function evmRpcToolNames(): string[] {
  return RPC_API_SURFACE.filter((method) => method.family === "evm").map((method) => method.name);
}

function solanaRpcToolNames(): string[] {
  return RPC_API_SURFACE.filter((method) => method.family === "solana").map((method) => method.name);
}

function commandNamesMatching(command: Command, expectedNames: string[]): string[] {
  const expected = new Set(expectedNames);
  return commandNames(command).filter((name) => expected.has(name));
}

function nestedCommand(root: Command, path: string[]): Command {
  let current = root;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) {
      throw new Error(`Missing command: ${path.join(" ")}`);
    }
    current = next;
  }
  return current;
}

type DataMethodMock = Mock<(...args: unknown[]) => Promise<unknown>>;
type DataServiceMocks = Record<string, DataMethodMock>;
type DataClientMocks = Record<string, DataServiceMocks>;

interface McpToolResult {
  content: Array<{ text: string }>;
  isError?: boolean;
}

type McpToolHandler = (
  input: Record<string, unknown>,
  context: { authInfo?: { token?: string } },
) => Promise<McpToolResult>;

function createDataClientMocks(): { client: DataClientMocks; calls: DataClientMocks } {
  const calls: DataClientMocks = {
    nft: {},
    prices: {},
    portfolio: {},
  };

  for (const method of DATA_API_SURFACE) {
    calls[method.service][method.sdkMethod] = vi.fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ ok: method.name });
  }

  return {
    calls,
    client: calls,
  };
}

function dataMethodMock(calls: DataClientMocks, method: DataApiSurfaceMethod): DataMethodMock {
  const fn = calls[method.service][method.sdkMethod];
  if (!fn) {
    throw new Error(`Missing Data API mock for ${method.service}.${method.sdkMethod}`);
  }
  return fn;
}

function rpcParamsFor(_method: RpcApiSurfaceMethod): unknown[] {
  return ["0xabc", "latest"];
}

function cliArgsForRpc(method: RpcApiSurfaceMethod): string[] {
  const params = JSON.stringify(rpcParamsFor(method));
  if (method.family === "solana") {
    return ["solana", method.name, "--params", params];
  }
  return ["evm", "rpc", method.name, "--params", params];
}

function cliArgsForData(method: DataApiSurfaceMethod): string[] {
  const args = ["evm", "data", method.name];
  if (method.input === "query") {
    args.push("--query", JSON.stringify(dataPayloadFor(method)));
  } else if (method.input === "body") {
    args.push("--body", JSON.stringify(dataPayloadFor(method)));
  }
  return args;
}

function dataPayloadFor(method: DataApiSurfaceMethod): Record<string, unknown> {
  if (method.service === "prices" && method.sdkMethod === "getTokenPricesBySymbol") {
    return { symbols: ["ETH"] };
  }

  if (method.service === "prices" && method.sdkMethod === "getTokenPricesByAddress") {
    return { addresses: [{ network: "eth-mainnet", address: "0xabc" }] };
  }

  if (method.service === "portfolio") {
    return { addresses: [{ address: "0xabc", networks: ["eth-mainnet"] }] };
  }

  return {
    address: "0xabc",
    contractAddress: "0xcontract",
    contractAddresses: ["0xcontract"],
    collectionSlug: "collection",
    endTime: "2024-01-02T00:00:00Z",
    excludeFilters: ["SPAM"],
    includeFilters: ["AIRDROPS"],
    interval: "1d",
    limit: 1,
    networks: ["eth-mainnet"],
    owner: "0xowner",
    pageKey: "page-key",
    pageSize: 1,
    query: "collection",
    refreshCache: false,
    startTime: "2024-01-01T00:00:00Z",
    startToken: "1",
    symbol: "ETH",
    symbols: ["ETH"],
    tokenId: "1",
    tokens: [{ contractAddress: "0xcontract", tokenId: "1" }],
    tokenType: "ERC721",
    wallet: "0xwallet",
    withMetadata: true,
    withTokenBalances: true,
  };
}

function mcpInputFor(method: RpcApiSurfaceMethod | DataApiSurfaceMethod): Record<string, unknown> {
  return {
    ...dataPayloadFor({
      name: "fixture",
      service: "nft",
      sdkMethod: "fixture",
      transport: "get",
      input: "query",
      requiresNetwork: true,
    }),
    addresses: ["eth-mainnet:0xabc"],
    blockCount: "0x1",
    blockHash: "0xblock",
    blockNumber: "latest",
    calls: [[{ to: "0xabc" }, "latest"]],
    commitment: "finalized",
    config: {},
    data: "0x",
    encoding: "jsonParsed",
    entryPoint: "0xentrypoint",
    from: "0xfrom",
    fromBlock: "latest",
    fullTransactions: false,
    index: "0x0",
    mint: "So11111111111111111111111111111111111111112",
    network: "family" in method && method.family === "solana" ? "solana-mainnet" : "eth-mainnet",
    newestBlock: "latest",
    params: {},
    pubkey: "solana-address",
    pubkeys: ["solana-address"],
    rewardPercentiles: [50],
    stateBlockNumber: "latest",
    storageSlot: "0x0",
    to: "0xto",
    toBlock: "latest",
    topics: [],
    transaction: "0xtransaction",
    transactionHash: "0xtx",
    transactions: ["0xtransaction"],
    userOperation: {},
    value: "0x0",
  };
}

function captureMcpTools(register: (server: never) => void): Map<string, McpToolHandler> {
  const tools = new Map<string, McpToolHandler>();
  register({
    tool(
      name: string,
      _description: string,
      _schema: unknown,
      _annotations: unknown,
      handler: McpToolHandler,
    ) {
      tools.set(name, handler);
    },
  } as never);
  return tools;
}

describe("RPC and Data API parity commands", () => {
  it("keeps SDK RPC surface in exact lockstep with MCP RPC tools", () => {
    expect(RPC_API_TOOL_NAMES).toEqual(mcpToolNames("apps/mcp-server/src/tools/rpc.ts"));
    expect(RPC_API_SURFACE.map(({ name, rpcMethod }) => ({ name, rpcMethod }))).toEqual(mcpRpcSurface());
  });

  it("keeps SDK Data API surface in exact lockstep with MCP Data API tools", () => {
    expect(DATA_API_TOOL_NAMES).toEqual(mcpToolNames("apps/mcp-server/src/tools/data.ts"));
    expect(DATA_API_SURFACE.map(({ name, service, sdkMethod }) => ({ name, service, sdkMethod }))).toEqual(mcpDataSurface());
  });

  it("registers MCP parity commands under the existing CLI namespaces", async () => {
    const { registerEvm } = await import("../../src/commands/evm.js");
    const { registerSolana } = await import("../../src/commands/solana.js");
    const program = new Command();
    registerEvm(program);
    registerSolana(program);

    expect(commandNames(nestedCommand(program, ["evm", "rpc"]))).toEqual(evmRpcToolNames());
    expect(commandNamesMatching(nestedCommand(program, ["evm", "data"]), DATA_API_TOOL_NAMES)).toEqual(DATA_API_TOOL_NAMES);
    expect(commandNamesMatching(nestedCommand(program, ["solana"]), solanaRpcToolNames())).toEqual(solanaRpcToolNames());
    expect(commandNames(program)).not.toContain("api");
  });

  it("routes EVM RPC parity commands through the matching JSON-RPC method", async () => {
    installBaseCommandMocks({ jsonMode: true });
    const call = vi.fn().mockResolvedValue({ result: "0x1" });
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveAPIKey: () => "api-key",
      resolveNetwork: () => "eth-mainnet",
      resolveSolanaNetwork: () => "solana-mainnet",
    }));

    const { registerEvm } = await import("../../src/commands/evm.js");
    await runRegisteredCommand(registerEvm, [
      "evm",
      "rpc",
      "ethGetBalance",
      "--params",
      "[\"0xabc\",\"latest\"]",
    ]);

    expect(call).toHaveBeenCalledWith("eth_getBalance", ["0xabc", "latest"]);
  });

  it("routes Solana RPC parity commands through the matching JSON-RPC method", async () => {
    installBaseCommandMocks({ jsonMode: true });
    const call = vi.fn().mockResolvedValue({ result: "0x1" });
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
      resolveAPIKey: () => "api-key",
      resolveNetwork: () => "eth-mainnet",
      resolveSolanaNetwork: () => "solana-mainnet",
    }));

    const { registerSolana } = await import("../../src/commands/solana.js");
    await runRegisteredCommand(registerSolana, [
      "solana",
      "solana_getBalance",
      "--params",
      "[\"solana-address\"]",
    ]);

    expect(call).toHaveBeenCalledWith("getBalance", ["solana-address"]);
  });

  it("smoke calls every RPC and Data API method through the CLI", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });

    const rpcCall = vi.fn().mockResolvedValue({ ok: true });
    const globalRpcCall = vi.fn().mockResolvedValue({ ok: true });
    const dataMocks = createDataClientMocks();

    vi.doMock("@alchemy/sdk", async () => ({
      ...(await vi.importActual<typeof import("@alchemy/sdk")>("@alchemy/sdk")),
      createAlchemyDataClient: () => dataMocks.client,
      globalRpcCall,
    }));
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call: rpcCall }),
      resolveAPIKey: () => "api-key",
      resolveNetwork: () => "eth-mainnet",
      resolveSolanaNetwork: () => "solana-mainnet",
    }));

    const { registerEvm } = await import("../../src/commands/evm.js");
    const { registerSolana } = await import("../../src/commands/solana.js");

    for (const method of RPC_API_SURFACE) {
      rpcCall.mockClear();
      globalRpcCall.mockClear();

      const register = method.family === "solana" ? registerSolana : registerEvm;
      await runRegisteredCommand(register, cliArgsForRpc(method));

      if (method.gateway === "global") {
        expect(globalRpcCall, method.name).toHaveBeenCalledWith(
          "api-key",
          method.rpcMethod,
          rpcParamsFor(method),
          expect.objectContaining({ breadcrumb: "alchemy-cli" }),
        );
      } else if (method.gateway === "network") {
        expect(rpcCall, method.name).toHaveBeenCalledWith(method.rpcMethod, rpcParamsFor(method));
      } else {
        throw new Error(`Unexpected RPC gateway: ${method.gateway}`);
      }
    }

    for (const method of DATA_API_SURFACE) {
      const fn = dataMethodMock(dataMocks.calls, method);
      fn.mockClear();

      await runRegisteredCommand(registerEvm, cliArgsForData(method));

      expect(fn, method.name).toHaveBeenCalledTimes(1);
    }

    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("smoke calls every RPC and Data API method through MCP tools", async () => {
    const networkRpcCall = vi.fn().mockResolvedValue({ ok: true });
    const globalRpcCall = vi.fn().mockResolvedValue({ ok: true });
    const dataMocks = createDataClientMocks();

    vi.doMock("../../../mcp-server/src/clients/rpc.js", () => ({
      mcpRpcClient: {
        networkRpcCall,
        globalRpcCall,
      },
    }));
    vi.doMock("../../../mcp-server/src/clients/data.js", () => ({
      mcpDataClient: {
        create: () => dataMocks.client,
      },
    }));
    vi.doMock("../../../mcp-server/src/tools/helpers.js", () => ({
      getApiKey: vi.fn().mockResolvedValue("api-key"),
      formatResult: (result: unknown) => JSON.stringify(result),
      handleToolError: (err: unknown) => ({
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      }),
      toolResult: (text: string) => ({ content: [{ type: "text", text }] }),
    }));

    const { registerRpcTools } = await import("../../../mcp-server/src/tools/rpc.js");
    const { registerDataTools } = await import("../../../mcp-server/src/tools/data.js");
    const rpcTools = captureMcpTools(registerRpcTools);
    const dataTools = captureMcpTools(registerDataTools);

    for (const method of RPC_API_SURFACE) {
      networkRpcCall.mockClear();
      globalRpcCall.mockClear();

      const tool = rpcTools.get(method.name);
      if (!tool) {
        throw new Error(`Missing MCP RPC tool: ${method.name}`);
      }

      const result = await tool(mcpInputFor(method), { authInfo: { token: "token" } });
      expect(result.isError, method.name).not.toBe(true);

      if (method.gateway === "global") {
        expect(globalRpcCall, method.name).toHaveBeenCalledWith("api-key", method.rpcMethod, rpcParamsFor(method));
      } else if (method.gateway === "network") {
        expect(networkRpcCall, method.name).toHaveBeenCalledWith(
          mcpInputFor(method).network,
          "api-key",
          method.rpcMethod,
          expect.anything(),
        );
      } else {
        throw new Error(`Unexpected RPC gateway: ${method.gateway}`);
      }
    }

    for (const method of DATA_API_SURFACE) {
      const fn = dataMethodMock(dataMocks.calls, method);
      fn.mockClear();

      const tool = dataTools.get(method.name);
      if (!tool) {
        throw new Error(`Missing MCP Data API tool: ${method.name}`);
      }

      const result = await tool(mcpInputFor(method), { authInfo: { token: "token" } });
      expect(result.isError, method.name).not.toBe(true);

      expect(fn, method.name).toHaveBeenCalledTimes(1);
    }
  });
});
