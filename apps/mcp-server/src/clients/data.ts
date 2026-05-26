import { createAlchemyDataClientFactory } from "@alchemy/sdk/data";

export type { AlchemyDataClient } from "@alchemy/sdk/data";
export { DataApiError } from "@alchemy/sdk/data";

const MCP_CLIENT_OPTIONS = {
  breadcrumb: "alchemy-mcp-server",
} as const;

export const mcpDataClient = createAlchemyDataClientFactory(MCP_CLIENT_OPTIONS);
