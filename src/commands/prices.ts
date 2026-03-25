import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { callApiPrices } from "../lib/rest.js";
import { resolveAPIKey } from "../lib/resolve.js";
import { splitCommaList } from "../lib/validators.js";
import { parseRequiredJSON } from "../lib/params.js";

export function registerPrices(program: Command) {
  const cmd = program
    .command("prices")
    .description("Prices API wrappers")
    .addHelpText(
      "after",
      `
Examples:
  alchemy prices symbol ETH,BTC
  alchemy prices address --addresses '[{"network":"eth-mainnet","address":"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48"}]'
  alchemy prices historical --body '{"symbol":"ETH","startTime":"2024-01-01","endTime":"2024-01-31","interval":"1d"}'`,
    );

  cmd
    .command("symbol <symbols>")
    .description("Get spot prices by symbol (comma-separated)")
    .action(async (symbols: string) => {
      try {
        const apiKey = resolveAPIKey(program);
        const values = splitCommaList(symbols);
        const query = new URLSearchParams();
        for (const symbol of values) query.append("symbols", symbol);
        const result = await withSpinner("Fetching prices…", "Prices fetched", () =>
          callApiPrices(apiKey, `/tokens/by-symbol?${query.toString()}`),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("address")
    .description("Get spot prices by token addresses")
    .requiredOption("--addresses <json>", "JSON array of {network,address}")
    .action(async (opts: { addresses: string }) => {
      try {
        const apiKey = resolveAPIKey(program);
        const body = { addresses: parseRequiredJSON<unknown[]>(opts.addresses, "--addresses") };
        const result = await withSpinner("Fetching prices…", "Prices fetched", () =>
          callApiPrices(apiKey, "/tokens/by-address", { method: "POST", body }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("historical")
    .description("Get historical prices")
    .requiredOption("--body <json>", "JSON request payload")
    .action(async (opts: { body: string }) => {
      try {
        const apiKey = resolveAPIKey(program);
        const payload = parseRequiredJSON<unknown>(opts.body, "--body");
        const result = await withSpinner("Fetching historical prices…", "Historical prices fetched", () =>
          callApiPrices(apiKey, "/tokens/historical", { method: "POST", body: payload }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
