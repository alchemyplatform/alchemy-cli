import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNetworkResources } from "./networks.js";

type ResourceServer = Pick<McpServer, "registerResource">;

export function registerAllResources(server: ResourceServer): void {
  registerNetworkResources(server);
}
