import { Command } from "commander";
import {
  resolveAppId,
  resolveConfiguredNetworkSlugs,
  resolveNetwork,
} from "../lib/resolve.js";
import * as output from "../lib/output.js";
import { dim, green, printTable } from "../lib/ui.js";
import { getRPCNetworks } from "../lib/networks.js";
import { exitWithError } from "../index.js";

function isVerboseEnabled(): boolean {
  try {
    return Boolean((output as { verbose?: boolean }).verbose);
  } catch {
    return false;
  }
}

export function registerNetwork(program: Command) {
  const cmd = program.command("network").description("Manage networks");

  cmd
    .command("list")
    .description("List supported RPC network slugs")
    .option(
      "--configured",
      "List only configured app RPC networks (requires access key and app context)",
    )
    .option(
      "--app-id <id>",
      "App ID for configured network lookups (overrides saved app)",
    )
    .action(async (opts: { configured?: boolean; appId?: string }) => {
      try {
        const supported = getRPCNetworks();
        const current = resolveNetwork(program);
        const configured = opts.configured
          ? await resolveConfiguredNetworkSlugs(program, opts.appId)
          : null;
        const configuredSet = new Set(configured ?? []);
        const appId = opts.configured
          ? opts.appId || resolveAppId(program)
          : undefined;

        const display = configured
          ? supported.filter((network) => configuredSet.has(network.id))
          : supported;

        if (output.isJSONMode()) {
          if (configured) {
            output.printJSON({
              mode: "configured",
              appId,
              configuredNetworkIds: configured,
              networks: display,
            });
            return;
          }

          output.printJSON(display);
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

        if (configured) {
          console.log(
            `\n  ${dim(`Configured networks for app ${appId}: ${display.length}`)}`,
          );
        }
        console.log(`\n  Current: ${green(current)}`);
        console.log(
          `  ${dim("Need Admin API chain enums instead? Run: alchemy chains list")}`,
        );

        if (isVerboseEnabled()) {
          console.log("");
          output.printJSON({
            mode: configured ? "configured" : "all",
            appId: appId ?? null,
            configuredNetworkIds: configured ?? null,
            networks: display,
            currentNetwork: current,
          });
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
