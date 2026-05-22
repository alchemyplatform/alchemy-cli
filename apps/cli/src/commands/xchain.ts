import { Command } from "commander";
import { registerBridge } from "./bridge.js";

export function registerXchain(program: Command) {
  const cmd = program
    .command("xchain")
    .description("Cross-chain operations");

  registerBridge(cmd);
}
