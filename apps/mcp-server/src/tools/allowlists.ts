import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import {
  updateNetworkAllowlist,
  updateAddressAllowlist,
  updateOriginAllowlist,
  updateIpAllowlist,
} from "../clients/admin.js";
import { requireAuth, toolResult, handleToolError } from "./helpers.js";

export function registerAllowlistTools(server: InstrumentedServer): void {
  server.tool(
    "update_allowlist",
    "Sets an allowlist for an Alchemy app. Replaces the current list entirely — pass an empty values array to clear. Types: 'network' (blockchain networks), 'address' (wallet addresses), 'origin' (allowed origins like https://example.com), 'ip' (IP addresses or CIDR ranges). Use get_app to see current allowlists.",
    {
      app_id: z.string().describe("The Alchemy app ID"),
      allowlist_type: z.enum(["network", "address", "origin", "ip"]).describe("Type of allowlist to update"),
      values: z.array(z.string()).describe("Values to set (network IDs, addresses, origins, or IPs)"),
      names: z.array(z.string()).optional().describe("Optional labels for each value (parallel array, same length as values)"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async ({ app_id, allowlist_type, values, names }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);

        if (allowlist_type === "network") {
          const app = await updateNetworkAllowlist(token, app_id, values);
          const networks = app.chainNetworks.map((n) => n.id).join(", ");
          return toolResult(`Updated networks for "${app.name}": ${networks}`);
        }

        const entries = values.map((v: string, i: number) => ({
          value: v,
          ...(names?.[i] ? { name: names[i] } : {}),
        }));

        if (allowlist_type === "address") {
          const app = await updateAddressAllowlist(token, app_id, entries);
          return toolResult(`Updated address allowlist for "${app.name}": ${app.addressAllowlist?.length ?? 0} address(es)`);
        }
        if (allowlist_type === "origin") {
          const app = await updateOriginAllowlist(token, app_id, entries);
          return toolResult(`Updated origin allowlist for "${app.name}": ${app.originAllowlist?.length ?? 0} origin(s)`);
        }
        // ip
        const app = await updateIpAllowlist(token, app_id, entries);
        return toolResult(`Updated IP allowlist for "${app.name}": ${app.ipAllowlist?.length ?? 0} IP(s)`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
