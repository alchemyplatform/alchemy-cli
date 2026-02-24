import { Command } from "commander";
import { printHuman } from "../lib/output.js";

export function registerVersion(program: Command) {
  program
    .command("version")
    .description("Print the CLI version")
    .action(() => {
      const version = program.version() || "dev";
      printHuman(`alchemy-cli ${version}\n`, { version });
    });
}
