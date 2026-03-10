import { Command } from "commander";
import { adminClientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, green, withSpinner, printTable, emptyState } from "../lib/ui.js";

export function registerChains(program: Command) {
  const cmd = program
    .command("chains")
    .description("Manage Admin API chain enums");

  cmd
    .command("list")
    .description("List available Admin API chain enums")
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

        if (chains.length === 0) {
          emptyState("No chain networks were returned.");
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

        if (verbose) {
          console.log("");
          printJSON(chains);
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
