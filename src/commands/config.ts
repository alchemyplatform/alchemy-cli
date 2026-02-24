import { Command } from "commander";
import * as config from "../lib/config.js";
import { errInvalidArgs, errNotFound } from "../lib/errors.js";
import { printHuman, printJSON, isJSONMode } from "../lib/output.js";
import { exitWithError } from "../index.js";
import { green, dim } from "../lib/ui.js";

export function registerConfig(program: Command) {
  const cmd = program.command("config").description("Manage CLI configuration");

  cmd
    .command("set <key> <value>")
    .description("Set a config value")
    .action((key: string, value: string) => {
      const cfg = config.load();
      const result = config.set(cfg, key, value);
      if (!result.ok) {
        exitWithError(
          errInvalidArgs(
            `Unknown config key: ${key} (valid keys: ${config.validKeys().join(", ")})`,
          ),
        );
      }
      config.save(result.config);
      printHuman(`${green("✓")} Set ${key}\n`, { key, status: "set" });
    });

  cmd
    .command("get <key>")
    .description("Get a config value")
    .action((key: string) => {
      const cfg = config.load();
      const value = config.get(cfg, key);
      if (value === undefined) {
        exitWithError(errNotFound(`config key '${key}'`));
      }
      printHuman(value + "\n", { key, value });
    });

  cmd
    .command("list")
    .description("List all config values")
    .action(() => {
      const cfg = config.load();
      const m = config.toMap(cfg);

      if (isJSONMode()) {
        printJSON(m);
        return;
      }

      const entries = Object.entries(m);
      if (entries.length === 0) {
        console.log("No configuration set.");
        return;
      }
      for (const [k, v] of entries) {
        console.log(`${dim(k)} = ${v}`);
      }
    });
}
