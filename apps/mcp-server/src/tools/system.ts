import type { InstrumentedServer } from "../server.js";
import { toolResult } from "./helpers.js";

export function registerSystemTools(server: InstrumentedServer): void {
  server.tool(
    "ping",
    "Health check. Returns 'pong' if the server is running.",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => toolResult("pong"),
  );
}
