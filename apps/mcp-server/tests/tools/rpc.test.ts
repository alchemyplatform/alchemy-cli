import { beforeEach, describe, expect, it, vi } from "vitest";

class MockRpcApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "RpcApiError";
  }
}

const redisGet = vi.fn();
const networkRpcCall = vi.fn();

vi.mock("../../src/redis.js", () => ({
  getRedisClient: () => ({
    get: redisGet,
  }),
}));

vi.mock("../../src/auth.js", () => ({
  hashToken: (token: string) => `hash:${token}`,
}));

vi.mock("../../src/clients/rpc.js", () => ({
  RpcApiError: MockRpcApiError,
  mcpRpcClient: {
    networkRpcCall,
  },
}));

const { registerRpcTools } = await import("../../src/tools/rpc.js");

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

function rpcTool(name: string) {
  const tools = new Map<string, (input: Record<string, unknown>, context: { authInfo?: { token?: string } }) => Promise<ToolResult>>();
  registerRpcTools({
    tool(toolName: string, _description: string, _schema: unknown, _annotations: unknown, handler: (input: Record<string, unknown>, context: { authInfo?: { token?: string } }) => Promise<ToolResult>) {
      tools.set(toolName, handler);
    },
  } as never);
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

function text(result: ToolResult): string {
  return result.content[0].text;
}

describe("RPC tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(JSON.stringify({ apiKey: "api-key" }));
  });

  it("maps Solana DAS plan errors to actionable MCP tool errors", async () => {
    networkRpcCall.mockRejectedValueOnce(
      new MockRpcApiError(-32000, "This method is not available on your plan. Upgrade to PAYG."),
    );

    const result = await rpcTool("solana_getAsset")(
      { network: "solana-mainnet", id: "asset-id" },
      { authInfo: { token: "auth-token" } },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Solana DAS request requires a paid Alchemy plan.");
    expect(text(result)).toContain("Upgrade your app to PAYG");
  });
});
