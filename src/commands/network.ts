import { Command } from "commander";
import { resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { green, printTable, printHeader } from "../lib/ui.js";

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

      printHeader("Networks");

      const rows = SUPPORTED_NETWORKS.map((n) => {
        const isCurrent = n.id === current;
        return [
          isCurrent ? green(n.id) : n.id,
          isCurrent ? green(n.name) : n.name,
          n.chain,
        ];
      });

      printTable(["Network ID", "Name", "Chain"], rows);
      console.log(`\n  Current: ${green(current)}`);
    });
}
