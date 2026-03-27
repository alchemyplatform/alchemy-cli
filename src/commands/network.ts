import { Command } from "commander";
import {
  resolveNetwork,
} from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { dim, green, printTable } from "../lib/ui.js";
import { getRPCNetworks } from "../lib/networks.js";
import { exitWithError } from "../lib/errors.js";

export function registerNetwork(program: Command) {
  const cmd = program.command("network").description("Manage networks");

  cmd
    .command("list")
    .description("List RPC network IDs for use with --network (e.g. eth-mainnet)")
    .option("--mainnet-only", "Show only mainnet networks")
    .option("--testnet-only", "Show only testnet networks")
    .option("--search <term>", "Filter networks by name or ID")
    .action(async (opts: { mainnetOnly?: boolean; testnetOnly?: boolean; search?: string }) => {
      try {
        let display = getRPCNetworks();
        const current = resolveNetwork(program);

        if (opts.mainnetOnly) {
          display = display.filter((n) => !n.isTestnet);
        } else if (opts.testnetOnly) {
          display = display.filter((n) => n.isTestnet);
        }

        if (opts.search) {
          const term = opts.search.toLowerCase();
          display = display.filter(
            (n) =>
              n.id.toLowerCase().includes(term) ||
              n.name.toLowerCase().includes(term) ||
              n.family.toLowerCase().includes(term),
          );
        }

        if (isJSONMode()) {
          printJSON(display);
          return;
        }

        const rows = display.map((network) => {
          const isCurrent = network.id === current;
          const idCell = isCurrent ? green(network.id) : network.id;
          const nameCell = isCurrent ? green(network.name) : network.name;
          const testnetCell = network.isTestnet ? dim("yes") : "no";
          return [idCell, nameCell, network.family, testnetCell];
        });

        printTable(["Network ID", "Name", "Family", "Testnet"], rows);

        console.log(`\n  Current: ${green(current)}`);
        console.log(
          `  ${dim("Need Admin API chain identifiers (e.g. ETH_MAINNET)? See: apps chains")}`,
        );
        console.log(
          `  ${dim("Need configured networks for an app? See: apps networks")}`,
        );

        if (verbose) {
          console.log("");
          printJSON({
            mode: "all",
            networks: display,
            currentNetwork: current,
          });
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
