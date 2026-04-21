import type { App } from "../../src/lib/admin-client.js";
import type { RPCResponse } from "../../src/lib/client.js";

// Keep these fixtures aligned with documented Alchemy API contract shapes.
// When endpoint docs change, update fixtures and E2E assertions together.
export const FIXTURES = {
  rpc: {
    balanceSuccess: {
      jsonrpc: "2.0",
      id: 1,
      result: "0x10",
    } satisfies RPCResponse,
    txNotFound: {
      jsonrpc: "2.0",
      id: 1,
      result: null,
    } satisfies RPCResponse,
    rpcError: {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "Method not found" },
    } satisfies RPCResponse,
  },
  admin: {
    listAppsSuccess: {
      data: {
        apps: [
          {
            id: "app-123",
            name: "E2E App",
            apiKey: "api-key-123",
            webhookApiKey: "webhook-key-123",
            chainNetworks: [
              {
                id: "ETH_MAINNET",
                name: "ETH_MAINNET",
                rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/api-key-123",
              },
            ],
            createdAt: "2026-01-01T00:00:00Z",
          } satisfies App,
        ],
      },
    },
  },
} as const;
