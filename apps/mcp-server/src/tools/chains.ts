import type { InstrumentedServer } from "../server.js";
import { listChains } from "../clients/admin.js";
import { requireAuth, toolResult, handleToolError } from "./helpers.js";

export function registerChainTools(server: InstrumentedServer): void {
  server.tool(
    "list_chains",
    "Lists all blockchain networks supported by Alchemy. Returns network ID, name, chain ID, and testnet status. Use this to find network IDs for create_app or update_allowlist.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (_params, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const chains = await listChains(token);
        const lines = chains.map(
          (c) => `${c.id} — ${c.name}${c.isTestnet ? " (testnet)" : ""}${c.networkChainId ? ` [chainId: ${c.networkChainId}]` : ""}`,
        );
        return toolResult(lines.join("\n"));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
