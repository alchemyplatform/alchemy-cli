import { Command } from "commander";
import { adminClientFromFlags } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { dim, green, withSpinner, printTable } from "../lib/ui.js";

export function registerChains(program: Command) {
  const cmd = program.command("chains").description("Manage chain networks");

  cmd
    .command("list")
    .description("List available chain networks")
    .action(async () => {
      try {
        const admin = adminClientFromFlags(program);
        const chains = await withSpinner(
          "Fetching chains…",
          "Chains fetched",
          () => admin.listChains(),
        );

        if (isJSONMode()) {
          printJSON(chains);
          return;
        }

        const rows = chains.map((c) => [
          c.id,
          c.name,
          c.isTestnet ? dim("yes") : "no",
          c.availability === "public"
            ? green(c.availability)
            : dim(c.availability),
          c.currency,
        ]);

        printTable(["ID", "Name", "Testnet", "Availability", "Currency"], rows);
      } catch (err) {
        exitWithError(err);
      }
    });
}
