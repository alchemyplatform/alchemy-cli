import type { InstrumentedServer } from "../server.js";
import { registerSystemTools } from "./system.js";
import { registerAppTools } from "./apps.js";
import { registerChainTools } from "./chains.js";
import { registerAllowlistTools } from "./allowlists.js";
import { registerRpcTools } from "./rpc.js";
import { registerDataTools } from "./data.js";

export function registerAllTools(server: InstrumentedServer): void {
  registerSystemTools(server);
  registerAppTools(server);
  registerChainTools(server);
  registerAllowlistTools(server);
  registerRpcTools(server);
  registerDataTools(server);
}
