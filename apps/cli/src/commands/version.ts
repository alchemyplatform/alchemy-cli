import { Command } from "commander";
import { printHuman } from "../lib/output.js";
import { bold, brand } from "../lib/ui.js";

export function registerVersion(program: Command) {
  program
    .command("version")
    .description("Print the CLI version")
    .action(() => {
      const version = program.version() || "dev";
      printHuman(`  ${brand("◆")} ${bold("alchemy-cli")} ${version}\n`, { version });
    });
}
