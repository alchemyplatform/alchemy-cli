import { createAlchemyRpcClient } from "@alchemy/sdk/evm";

export { RpcApiError, validateNetwork } from "@alchemy/sdk/evm";

export const mcpRpcClient = createAlchemyRpcClient({
  breadcrumb: "alchemy-mcp-server",
});
