import { Command } from "commander";
import { resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";

const SUPPORTED_NETWORKS = [
  { id: "eth-mainnet", name: "Ethereum Mainnet", chain: "Ethereum" },
  { id: "eth-sepolia", name: "Ethereum Sepolia", chain: "Ethereum" },
  { id: "eth-holesky", name: "Ethereum Holesky", chain: "Ethereum" },
  { id: "polygon-mainnet", name: "Polygon Mainnet", chain: "Polygon" },
  { id: "polygon-amoy", name: "Polygon Amoy", chain: "Polygon" },
  { id: "arb-mainnet", name: "Arbitrum One", chain: "Arbitrum" },
  { id: "arb-sepolia", name: "Arbitrum Sepolia", chain: "Arbitrum" },
  { id: "opt-mainnet", name: "Optimism Mainnet", chain: "Optimism" },
  { id: "opt-sepolia", name: "Optimism Sepolia", chain: "Optimism" },
  { id: "base-mainnet", name: "Base Mainnet", chain: "Base" },
  { id: "base-sepolia", name: "Base Sepolia", chain: "Base" },
];

export function registerNetwork(program: Command) {
  const cmd = program.command("network").description("Manage networks");

  cmd
    .command("list")
    .description("List supported networks")
    .action(() => {
      if (isJSONMode()) {
        printJSON(SUPPORTED_NETWORKS);
        return;
      }

      const current = resolveNetwork(program);
      console.log("Supported networks:\n");
      for (const n of SUPPORTED_NETWORKS) {
        const marker = n.id === current ? "* " : "  ";
        console.log(`${marker}${n.id.padEnd(20)} ${n.name}`);
      }
      console.log(`\nCurrent: ${current}`);
    });
}
