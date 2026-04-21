import { Command } from "commander";
import { clientFromFlags } from "../lib/resolve.js";
import { verbose, isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable, emptyState, printKeyValueBox, printSyntaxJSON } from "../lib/ui.js";
import { validateAddress, resolveAddress, readStdinArg } from "../lib/validators.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { promptSelect } from "../lib/terminal-ui.js";
import type { AlchemyClient } from "../lib/client-interface.js";

interface TokenResponse {
  address: string;
  tokenBalances: Array<{
    contractAddress: string;
    tokenBalance: string;
  }>;
  pageKey?: string;
}

interface TokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  logo: string | null;
}

type PaginationAction = "next" | "stop";

async function promptTokensPagination(): Promise<PaginationAction> {
  const action = await promptSelect({
    message: "More token balances available",
    options: [
      { label: "Load next page", value: "next" },
      { label: "Stop here", value: "stop" },
    ],
    initialValue: "next",
    cancelMessage: "Stopped pagination.",
  });
  if (action === null) return "stop";
  return action as PaginationAction;
}

function filterNonZero(balances: TokenResponse["tokenBalances"]) {
  return balances.filter(
    (tb) =>
      tb.tokenBalance !== "0x0" &&
      tb.tokenBalance !==
        "0x0000000000000000000000000000000000000000000000000000000000000000",
  );
}

function formatTokenRows(balances: TokenResponse["tokenBalances"]): string[][] {
  return filterNonZero(balances).map((tb) => {
    let decimalBalance = dim("unparseable");
    try {
      decimalBalance = BigInt(tb.tokenBalance).toString();
    } catch {
      // Keep fallback when provider returns unexpected non-hex content.
    }
    return [tb.contractAddress, decimalBalance, tb.tokenBalance];
  });
}

function formatWithDecimals(rawBalance: string, decimals: number | null): string {
  if (decimals === null || decimals === 0) {
    try {
      return BigInt(rawBalance).toString();
    } catch {
      return rawBalance;
    }
  }
  try {
    const raw = BigInt(rawBalance);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const remainder = raw % divisor;
    if (remainder === 0n) return whole.toString();
    const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
  } catch {
    return rawBalance;
  }
}

async function resolveMetadata(
  client: AlchemyClient,
  balances: TokenResponse["tokenBalances"],
): Promise<Map<string, TokenMetadata>> {
  const nonZero = filterNonZero(balances);
  const results = await Promise.all(
    nonZero.map(async (tb) => {
      try {
        const meta = await client.call("alchemy_getTokenMetadata", [tb.contractAddress]) as TokenMetadata;
        return [tb.contractAddress, meta] as const;
      } catch {
        return [tb.contractAddress, { name: null, symbol: null, decimals: null, logo: null }] as const;
      }
    }),
  );
  return new Map(results);
}

function formatResolvedRows(
  balances: TokenResponse["tokenBalances"],
  metadata: Map<string, TokenMetadata>,
): string[][] {
  return filterNonZero(balances).map((tb) => {
    const meta = metadata.get(tb.contractAddress);
    const symbol = meta?.symbol ?? "???";
    const formatted = formatWithDecimals(tb.tokenBalance, meta?.decimals ?? null);
    return [tb.contractAddress, symbol, `${formatted} ${symbol}`];
  });
}

function formatResolvedJSON(
  balances: TokenResponse["tokenBalances"],
  metadata: Map<string, TokenMetadata>,
) {
  return filterNonZero(balances).map((tb) => {
    const meta = metadata.get(tb.contractAddress);
    return {
      contractAddress: tb.contractAddress,
      tokenBalance: tb.tokenBalance,
      ...(meta?.symbol && { symbol: meta.symbol }),
      ...(meta?.name && { name: meta.name }),
      ...(meta?.decimals !== null && meta?.decimals !== undefined && { decimals: meta.decimals }),
      ...(meta?.decimals !== null && meta?.decimals !== undefined && {
        formattedBalance: formatWithDecimals(tb.tokenBalance, meta.decimals),
      }),
    };
  });
}

export function registerTokens(program: Command) {
  const cmd = program
    .command("tokens")
    .description("Token API wrappers");

  // ── tokens balances ───────────────────────────────────────────────

  cmd
    .command("balances")
    .argument("[address]", "Wallet address or ENS name, or pipe via stdin")
    .description("Get ERC-20 token balances for an address")
    .option("--page-key <key>", "Pagination key from a previous response")
    .option("--metadata", "Fetch token metadata (symbol, decimals) and show formatted balances")
    .addHelpText(
      "after",
      `
Examples:
  alchemy data tokens balances 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
  alchemy data tokens balances 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --metadata
  echo 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 | alchemy data tokens balances`,
    )
    .action(async (addressArg: string | undefined, opts: { pageKey?: string; metadata?: boolean }) => {
      try {
        const addressInput = addressArg ?? (await readStdinArg("address"));
        const client = clientFromFlags(program);
        const address = await resolveAddress(addressInput, client);

        const params: unknown[] = [address];
        if (opts.pageKey) {
          params.push("erc20", { pageKey: opts.pageKey });
        }

        const result = await withSpinner("Fetching token balances…", "Token balances fetched", () =>
          client.call("alchemy_getTokenBalances", params),
        ) as TokenResponse;

        const nonZero = filterNonZero(result.tokenBalances);

        if (nonZero.length === 0) {
          if (isJSONMode()) {
            printJSON(result);
          } else {
            emptyState("No token balances found.");
          }
          return;
        }

        // Resolve metadata if requested
        const metadata = opts.metadata
          ? await withSpinner(
              `Resolving metadata for ${nonZero.length} tokens…`,
              "Metadata resolved",
              () => resolveMetadata(client, result.tokenBalances),
            )
          : null;

        if (isJSONMode()) {
          if (metadata) {
            printJSON({
              address: result.address,
              tokenBalances: formatResolvedJSON(result.tokenBalances, metadata),
              ...(result.pageKey && { pageKey: result.pageKey }),
            });
          } else {
            printJSON(result);
          }
          return;
        }

        let totalShown = nonZero.length;

        printKeyValueBox([
          ["Address", address],
          ["Network", client.network],
          ["Tokens", String(totalShown)],
        ]);

        if (metadata) {
          const rows = formatResolvedRows(result.tokenBalances, metadata);
          printTable(["Contract", "Symbol", "Balance"], rows);
        } else {
          const rows = formatTokenRows(result.tokenBalances);
          printTable(["Contract", "Balance (base units)", "Raw (hex)"], rows);
        }

        console.log(`\n  ${dim(`${totalShown} tokens (zero balances hidden).`)}`);
        if (!metadata) {
          console.log(`  ${dim("Tip: use --metadata to fetch token symbols, decimals, and show formatted balances.")}`);
        }

        if (verbose) {
          console.log("");
          printJSON(result);
        }

        const interactive = isInteractiveAllowed(program);
        let pageKey = result.pageKey;

        while (pageKey && interactive) {
          const action = await promptTokensPagination();
          if (action === "stop") {
            console.log(`\n  ${dim(`Next page key: ${pageKey}`)}`);
            break;
          }

          const nextResult = await withSpinner("Fetching next page…", "Page fetched", () =>
            client.call("alchemy_getTokenBalances", [address, "erc20", { pageKey }]),
          ) as TokenResponse;

          if (isJSONMode()) {
            printJSON(nextResult);
            return;
          }

          const nextNonZero = filterNonZero(nextResult.tokenBalances);
          totalShown += nextNonZero.length;

          if (nextNonZero.length > 0) {
            if (metadata) {
              const nextMeta = await withSpinner(
                `Resolving metadata for ${nextNonZero.length} tokens…`,
                "Metadata resolved",
                () => resolveMetadata(client, nextResult.tokenBalances),
              );
              const rows = formatResolvedRows(nextResult.tokenBalances, nextMeta);
              printTable(["Contract", "Symbol", "Balance"], rows);
            } else {
              const rows = formatTokenRows(nextResult.tokenBalances);
              printTable(["Contract", "Balance (base units)", "Raw (hex)"], rows);
            }
          }
          console.log(`\n  ${dim(`${totalShown} tokens total (zero balances hidden).`)}`);

          pageKey = nextResult.pageKey;
        }

        if (pageKey && !interactive) {
          console.log(`\n  ${dim(`More results available. Use --page-key ${pageKey} to see the next page.`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── tokens metadata ───────────────────────────────────────────────

  cmd
    .command("metadata <contract>")
    .description("Get ERC-20 token metadata (name, symbol, decimals, logo)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy data tokens metadata 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48`,
    )
    .action(async (contract: string) => {
      try {
        validateAddress(contract);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token metadata…", "Token metadata fetched", () =>
          client.call("alchemy_getTokenMetadata", [contract]),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── tokens allowance ──────────────────────────────────────────────

  cmd
    .command("allowance")
    .description("Get ERC-20 token allowance")
    .requiredOption("--owner <address>", "Owner address")
    .requiredOption("--spender <address>", "Spender address")
    .requiredOption("--contract <address>", "Token contract address")
    .action(async (opts: { owner: string; spender: string; contract: string }) => {
      try {
        validateAddress(opts.owner);
        validateAddress(opts.spender);
        validateAddress(opts.contract);
        const client = clientFromFlags(program);
        const result = await withSpinner("Fetching token allowance…", "Token allowance fetched", () =>
          client.call("alchemy_getTokenAllowance", [{
            owner: opts.owner,
            spender: opts.spender,
            contract: opts.contract,
          }]),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
