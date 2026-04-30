import { Command } from "commander";
import { printJSON, isJSONMode } from "../lib/output.js";
import { getSetupStatus } from "../lib/onboarding.js";
import { load as loadConfig } from "../lib/config.js";
import { printKeyValueBox, green, dim } from "../lib/ui.js";

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Run readiness checks and print suggested fixes")
    .action(() => {
      const setup = getSetupStatus(loadConfig());
      const payload = {
        ok: setup.complete,
        checks: {
          setup,
        },
      };

      if (isJSONMode()) {
        printJSON(payload);
        return;
      }

      printKeyValueBox([
        ["Setup", setup.complete ? green("complete") : dim("incomplete")],
        ["Satisfied By", setup.satisfiedBy ?? dim("none")],
        ["Missing", setup.missing.length > 0 ? setup.missing.join(", ") : dim("none")],
      ]);

      if (setup.nextCommands.length > 0) {
        console.log("");
        console.log("  Suggested next commands:");
        for (const command of setup.nextCommands) {
          console.log(`  ${command}`);
        }
      }
    });
}
