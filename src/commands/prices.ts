import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { printJSON, isJSONMode } from "../lib/output.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { callApiPrices } from "../lib/rest.js";
import { resolveAPIKey, resolveX402Client } from "../lib/resolve.js";
import { splitCommaList } from "../lib/validators.js";

export function registerPrices(program: Command) {
  const cmd = program.command("price").description("Token price data");

  cmd
    .command("symbol <symbols>")
    .description("Get spot prices by symbol (comma-separated)")
    .action(async (symbols: string) => {
      try {
        const values = splitCommaList(symbols);
        const query = new URLSearchParams();
        for (const symbol of values) query.append("symbols", symbol);
        const x402 = resolveX402Client(program);
        const result = await withSpinner("Fetching prices…", "Prices fetched", () =>
          x402
            ? x402.callRest(`prices/v1/tokens/by-symbol?${query.toString()}`)
            : callApiPrices(resolveAPIKey(program), `/tokens/by-symbol?${query.toString()}`),
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
        const body = { addresses: JSON.parse(opts.addresses) as unknown[] };
        const x402 = resolveX402Client(program);
        const result = await withSpinner("Fetching prices…", "Prices fetched", () =>
          x402
            ? x402.callRest("prices/v1/tokens/by-address", { method: "POST", body })
            : callApiPrices(resolveAPIKey(program), "/tokens/by-address", { method: "POST", body }),
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
    .addHelpText(
      "after",
      `
Examples:
  alchemy data price historical --body '{"symbol":"ETH","startTime":"2024-01-01T00:00:00Z","endTime":"2024-01-02T00:00:00Z","interval":"1h"}'
  alchemy data price historical --body '{"address":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","network":"eth-mainnet","startTime":"2024-06-01","endTime":"2024-06-07","interval":"1d"}'`,
    )
    .action(async (opts: { body: string }) => {
      try {
        const payload = JSON.parse(opts.body) as unknown;
        const x402 = resolveX402Client(program);
        const result = await withSpinner("Fetching historical prices…", "Historical prices fetched", () =>
          x402
            ? x402.callRest("prices/v1/tokens/historical", { method: "POST", body: payload })
            : callApiPrices(resolveAPIKey(program), "/tokens/historical", { method: "POST", body: payload }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
