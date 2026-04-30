import { Command } from "commander";
import { errInvalidArgs, exitWithError } from "../../lib/errors.js";

function notImplemented(target: string): never {
  throw errInvalidArgs(
    `alchemy install ${target} is not implemented yet. This command is reserved for the v1 installer surface.`,
  );
}

export function registerInstall(program: Command) {
  const cmd = program
    .command("install")
    .description("Install Alchemy MCP and skills into agent clients");

  cmd
    .command("mcp")
    .description("Install Alchemy's remote MCP server")
    .option("--client <clients>", "Target clients: claude, cursor, codex, or all")
    .option("--dry-run", "Preview changes without writing client config")
    .action(() => {
      try {
        notImplemented("mcp");
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("skills")
    .description("Install Alchemy skills")
    .option("--client <clients>", "Target clients: claude, cursor, codex, or all")
    .option("--dry-run", "Preview changes without writing skill files")
    .action(() => {
      try {
        notImplemented("skills");
      } catch (err) {
        exitWithError(err);
      }
    });
}
