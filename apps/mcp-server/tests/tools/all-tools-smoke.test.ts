import { describe, expect, it, vi } from "vitest";

class MockAdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

class MockRpcApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcApiError";
  }
}

class MockDataApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DataApiError";
  }
}

const APP = {
  id: "app_123",
  name: "Smoke App",
  description: "MCP smoke fixture",
  apiKey: "alchemy-api-key",
  webhookApiKey: "alchemy-webhook-key",
  chainNetworks: [
    {
      id: "ETH_MAINNET",
      name: "Ethereum Mainnet",
      networkChainId: "1",
      rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/key",
    },
  ],
  addressAllowlist: [{ value: "0x0000000000000000000000000000000000000001" }],
  originAllowlist: [{ value: "https://example.com" }],
  ipAllowlist: [{ value: "127.0.0.1" }],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const POLICY = {
  policyId: "policy_123",
  appId: APP.id,
  status: "active",
  policyName: "Smoke Policy",
  policyType: "sponsorship",
  networks: ["ETH_MAINNET"],
};

const redisGet = vi.fn(async () =>
  JSON.stringify({
    apiKey: APP.apiKey,
    webhookApiKey: APP.webhookApiKey,
    appId: APP.id,
    appName: APP.name,
  }),
);
const redisSet = vi.fn(async () => "OK");

const listApps = vi.fn(async () => ({ apps: [APP] }));
const getApp = vi.fn(async () => APP);
const createApp = vi.fn(async () => APP);
const updateApp = vi.fn(async () => APP);
const listChains = vi.fn(async () => [
  {
    id: "ETH_MAINNET",
    name: "Ethereum Mainnet",
    networkChainId: "1",
    isTestnet: false,
  },
]);
const updateNetworkAllowlist = vi.fn(async () => APP);
const updateAddressAllowlist = vi.fn(async () => APP);
const updateOriginAllowlist = vi.fn(async () => APP);
const updateIpAllowlist = vi.fn(async () => APP);

const mcpAdminClient = {
  getApp: vi.fn(async () => APP),
  listWebhooks: vi.fn(async () => ({ webhooks: [{ id: "webhook_123" }] })),
  createWebhook: vi.fn(async () => ({ id: "webhook_123", status: "created" })),
  updateWebhook: vi.fn(async () => ({ id: "webhook_123", status: "updated" })),
  deleteWebhook: vi.fn(async () => ({ id: "webhook_123", deleted: true })),
  getWebhookAddresses: vi.fn(async () => ({ addresses: [] })),
  getWebhookNftFilters: vi.fn(async () => ({ filters: [] })),
  listAllGasManagerPolicies: vi.fn(async () => [POLICY]),
  getGasManagerPolicy: vi.fn(async () => POLICY),
  createGasManagerPolicy: vi.fn(async () => POLICY),
  setGasManagerPolicyStatus: vi.fn(async () => POLICY),
};

const mcpRpcClient = {
  networkRpcCall: vi.fn(async (network: string, _apiKey: string, method: string) => ({
    network,
    method,
    ok: true,
  })),
  globalRpcCall: vi.fn(async (_apiKey: string, method: string) => ({
    method,
    ok: true,
  })),
};

function createDataService(service: string): Record<string, unknown> {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      return vi.fn(async () => ({
        service,
        method: prop,
        ok: true,
      }));
    },
  });
}

const mcpDataClient = {
  create: vi.fn(() => ({
    nft: createDataService("nft"),
    prices: createDataService("prices"),
    portfolio: createDataService("portfolio"),
  })),
};

vi.mock("../../src/redis.js", () => ({
  getRedisClient: () => ({
    get: redisGet,
    set: redisSet,
  }),
}));

vi.mock("../../src/auth.js", () => ({
  hashToken: (token: string) => `hash:${token}`,
}));

vi.mock("../../src/clients/admin.js", () => ({
  AdminApiError: MockAdminApiError,
  mcpAdminClient,
  listApps,
  getApp,
  createApp,
  updateApp,
  listChains,
  updateNetworkAllowlist,
  updateAddressAllowlist,
  updateOriginAllowlist,
  updateIpAllowlist,
}));

vi.mock("../../src/clients/rpc.js", () => ({
  RpcApiError: MockRpcApiError,
  mcpRpcClient,
}));

vi.mock("../../src/clients/data.js", () => ({
  DataApiError: MockDataApiError,
  mcpDataClient,
}));

const { registerAllTools } = await import("../../src/tools/index.js");

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

type ToolHandler = (
  input: Record<string, unknown>,
  context: { authInfo?: { token?: string } },
) => Promise<ToolResult>;

function captureTools(): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const server = {
    tool(...args: unknown[]) {
      const name = args[0];
      const handler = args[args.length - 1];
      if (typeof name !== "string" || typeof handler !== "function") {
        throw new Error("Unexpected tool registration signature");
      }
      tools.set(name, handler as ToolHandler);
    },
  };

  registerAllTools(server as never);
  return tools;
}

function smokeInput(toolName: string): Record<string, unknown> {
  return {
    accountAddress: "0x0000000000000000000000000000000000000001",
    accountKeys: ["solana-address"],
    address: "0x0000000000000000000000000000000000000001",
    addresses: ["eth-mainnet:0x0000000000000000000000000000000000000001"],
    after: "signature-after",
    allowlist_type: "network",
    app_id: APP.id,
    authorityAddress: "solana-authority",
    before: "signature-before",
    blockCount: "0x1",
    blockHash: "0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd",
    blockNumber: "latest",
    blockhash: "5eykt4UsFv8P8njbHkxA7ZY3W6dSoVQ6hH3MfMecLJwz",
    body: { webhook_id: "webhook_123" },
    callId: "0xcall",
    calls: [[{ to: "0x0000000000000000000000000000000000000001" }, "latest"]],
    capabilities: {},
    category: ["external"],
    chainId: "1",
    chainIds: ["1"],
    chain_networks: ["ETH_MAINNET"],
    collectionSlug: "boredapeyachtclub",
    commitment: "finalized",
    compressed: false,
    contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    contractAddress: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
    contractAddresses: ["0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"],
    count: 1,
    creatorAddress: "solana-creator",
    cursor: "cursor",
    data: "0x",
    dataLength: 100,
    delegate: "solana-delegate",
    description: "Smoke description",
    dummySignature: "0xdummy",
    encoding: "jsonParsed",
    endSlot: 200000001,
    endTime: "2024-01-02T00:00:00Z",
    entryPoint: "0x0000000000000000000000000000000000000002",
    epoch: 1,
    excludeFilters: ["SPAM"],
    excludeZeroValue: true,
    expirySec: 60,
    filter: {},
    filters: [],
    from: "0x0000000000000000000000000000000000000001",
    fromAddress: "0x0000000000000000000000000000000000000001",
    fromAmount: "1",
    fromBlock: "latest",
    fromToken: "ETH",
    fullTransactions: false,
    groupKey: "collection",
    groupValue: "group-value",
    grouping: ["collection", "group-value"],
    id: "asset-id",
    ids: ["asset-id"],
    includeFilters: ["AIRDROPS"],
    index: "0x0",
    interval: "1d",
    keyPublicKey: "solana-key",
    keyType: "ed25519",
    lamports: 1,
    limit: 1,
    maxCount: "0x1",
    maxSupportedTransactionVersion: 0,
    message: "encoded-message",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    name: "Smoke App",
    names: ["Ethereum Mainnet"],
    network: toolName.startsWith("solana_") ? "solana-mainnet" : "eth-mainnet",
    networks: ["ETH_MAINNET"],
    newestBlock: "latest",
    options: {},
    order: "desc",
    orderBy: "transferTime",
    overrides: {},
    owner: "0x0000000000000000000000000000000000000001",
    ownerAddress: "solana-owner",
    page: 1,
    pageKey: "page-key",
    pageSize: 1,
    permissions: [],
    policyId: POLICY.policyId,
    policy_id: POLICY.policyId,
    policy_name: POLICY.policyName,
    policy_type: "sponsorship",
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    pubkey: "solana-address",
    pubkeys: ["solana-address"],
    query: "bored ape",
    refreshCache: false,
    replaceRecentBlockhash: true,
    rewardPercentiles: [50],
    rewards: false,
    searchTransactionHistory: true,
    sigVerify: false,
    signature: "signature",
    signatures: ["signature"],
    signerAddress: "0x0000000000000000000000000000000000000001",
    slippage: 0.01,
    slot: 200000000,
    spender: "0x0000000000000000000000000000000000000002",
    startSlot: 200000000,
    startTime: "2024-01-01T00:00:00Z",
    startToken: "1",
    stateBlockNumber: "latest",
    status: "active",
    storageKeys: ["0x0"],
    storageSlot: "0x0",
    symbol: "ETH",
    symbols: ["ETH"],
    timeout: 1,
    to: "0x0000000000000000000000000000000000000002",
    toAddress: "0x0000000000000000000000000000000000000002",
    toBlock: "latest",
    toToken: "USDC",
    tokenId: "1",
    tokenType: "ERC721",
    tokens: [{ contractAddress: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D", tokenId: "1" }],
    topics: [],
    traceType: ["trace"],
    tracer: "callTracer",
    transaction: "0xtransaction",
    transactionDetails: "full",
    transactionHash: "0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
    transactions: ["0xtransaction"],
    until: "signature-until",
    userOpHash: "0xuserop",
    userOperation: {},
    value: "0x0",
    values: ["ETH_MAINNET"],
    votePubkey: "vote-pubkey",
    wallet: "0x0000000000000000000000000000000000000001",
    walletAddress: "0x0000000000000000000000000000000000000001",
    webhook_id: "webhook_123",
    webhook_url: "https://example.com/webhook",
    withContext: true,
    withMetadata: true,
    withTokenBalances: true,
  };
}

const tools = captureTools();

describe("all MCP tools", () => {
  it("registers every tool with a smoke handler", () => {
    expect(tools.size).toBe(169);
    expect(new Set(tools.keys()).size).toBe(tools.size);
  });

  it.each([...tools.entries()].map(([name, handler]) => ({ name, handler })))(
    "smoke calls $name",
    async ({ name, handler }) => {
      const result = await handler(smokeInput(name), { authInfo: { token: "auth-token" } });

      expect(result.isError, `${name} returned an MCP tool error`).not.toBe(true);
      expect(result.content.length, `${name} returned no content`).toBeGreaterThan(0);
    },
  );
});
