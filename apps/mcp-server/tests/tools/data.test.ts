import { beforeEach, describe, expect, it, vi } from "vitest";

const redisGet = vi.fn();
const portfolio = {
  getTokensByAddress: vi.fn(),
  getTokenBalancesByAddress: vi.fn(),
  getNFTsByAddress: vi.fn(),
  getNFTContractsByAddress: vi.fn(),
};

vi.mock("../../src/redis.js", () => ({
  getRedisClient: () => ({
    get: redisGet,
  }),
}));

vi.mock("../../src/auth.js", () => ({
  hashToken: (token: string) => `hash:${token}`,
}));

vi.mock("../../src/clients/data.js", () => ({
  DataApiError: class DataApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "DataApiError";
    }
  },
  mcpDataClient: {
    create: () => ({
      portfolio,
    }),
  },
}));

const { registerDataTools } = await import("../../src/tools/data.js");

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

function dataTool(name: string) {
  const tools = new Map<string, (input: Record<string, unknown>, context: { authInfo?: { token?: string } }) => Promise<ToolResult>>();
  registerDataTools({
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

describe("data tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisGet.mockResolvedValue(JSON.stringify({ apiKey: "api-key" }));
  });

  it("normalizes and limits portfolio responses", async () => {
    portfolio.getTokenBalancesByAddress.mockResolvedValueOnce({
      data: [
        {
          balance: "0x0de0b6b3a7640000",
          tokenMetadata: { decimals: 18 },
        },
        { balance: "0x02", decimals: 0 },
      ],
    });

    const result = await dataTool("getTokenBalancesByAddress")(
      {
        address: "0x0000000000000000000000000000000000000001",
        networks: ["eth-mainnet"],
        limit: 1,
      },
      { authInfo: { token: "auth-token" } },
    );

    expect(portfolio.getTokenBalancesByAddress).toHaveBeenCalledWith({
      addresses: [{ address: "0x0000000000000000000000000000000000000001", networks: ["eth-mainnet"] }],
    });
    expect(JSON.parse(text(result))).toEqual({
      data: [
        {
          balance: "0x0de0b6b3a7640000",
          balanceDecimal: "1000000000000000000",
          balanceFormatted: "1",
          tokenMetadata: { decimals: 18 },
        },
      ],
    });
  });
});
