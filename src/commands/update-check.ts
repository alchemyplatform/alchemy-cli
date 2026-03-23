import { Command } from "commander";
import { isJSONMode, printJSON } from "../lib/output.js";
import { dim, printKeyValueBox } from "../lib/ui.js";
import { getUpdateStatus } from "../lib/update-check.js";

function formatCheckedAt(checkedAt: number | null): string {
  return checkedAt ? new Date(checkedAt).toISOString() : dim("(unknown)");
}

export function registerUpdateCheck(program: Command) {
  program
    .command("update-check")
    .description("Check whether a newer CLI version is available")
    .action(() => {
      const status = getUpdateStatus();

      if (isJSONMode()) {
        printJSON(status);
        return;
      }

      printKeyValueBox([
        ["Current version", status.currentVersion],
        ["Latest version", status.latestVersion ?? dim("(unknown)")],
        ["Update available", status.updateAvailable ? "yes" : "no"],
        ["Checked at", formatCheckedAt(status.checkedAt)],
        ["Install", status.installCommand],
      ]);
    });
}
