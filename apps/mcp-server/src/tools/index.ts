import type { InstrumentedServer } from "../server.js";
import { registerSystemTools } from "./system.js";
import { registerAppTools } from "./apps.js";
import { registerChainTools } from "./chains.js";
import { registerAllowlistTools } from "./allowlists.js";
import { registerRpcTools } from "./rpc.js";
import { registerDataTools } from "./data.js";
import { registerWebhookTools } from "./webhooks.js";
import { registerGasManagerTools } from "./gas-manager.js";

export function registerAllTools(server: InstrumentedServer): void {
  registerSystemTools(server);
  registerAppTools(server);
  registerChainTools(server);
  registerAllowlistTools(server);
  registerWebhookTools(server);
  registerGasManagerTools(server);
  registerRpcTools(server);
  registerDataTools(server);
}
