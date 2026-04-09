import { Command } from "commander";
import { load as loadConfig } from "../lib/config.js";
import { getSetupStatus } from "../lib/onboarding.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { printKeyValueBox, dim } from "../lib/ui.js";

export function registerSetup(program: Command) {
  const cmd = program.command("setup").description("Setup and onboarding utilities");

  cmd
    .command("status")
    .description("Show setup status and remediation commands")
    .action(() => {
      const status = getSetupStatus(loadConfig());
      if (isJSONMode()) {
        printJSON(status);
        return;
      }

      const methodLabels: Record<string, string> = {
        api_key: "API key",
        access_key_app: "Access key + app",
        x402_wallet: "SIWx wallet",
        auth_token: "Browser login + app",
      };
      printKeyValueBox([
        ["Complete", status.complete ? "yes" : "no"],
        ["Satisfied by", status.satisfiedBy ? methodLabels[status.satisfiedBy] ?? status.satisfiedBy : dim("(none)")],
      ]);
      if (status.missing.length > 0) {
        console.log("");
        console.log(`  ${dim("Missing:")}`);
        for (const item of status.missing) {
          console.log(`  ${dim(`- ${item}`)}`);
        }
      }
      if (status.nextCommands.length > 0) {
        console.log("");
        console.log(`  ${dim("Next commands:")}`);
        for (const command of status.nextCommands) {
          console.log(`  ${dim(`- ${command}`)}`);
        }
      }
    });
}
