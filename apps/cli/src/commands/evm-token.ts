import { Command } from "commander";
import { resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { errInvalidArgs, errNotFound, exitWithError } from "../lib/errors.js";
import { dim, green, printKeyValue, printTable } from "../lib/ui.js";
import {
  findRegistryToken,
  getRegistryNetworks,
  listRegistryTokens,
  registrySymbolSuggestions,
  type RegistryToken,
} from "../lib/token-registry.js";

interface LookupOpts {
  addressOnly?: boolean;
}

interface ListOpts {
  all?: boolean;
}

function tokenJSON(token: RegistryToken, network: string) {
  return {
    symbol: token.symbol,
    address: token.address,
    decimals: token.decimals,
    name: token.name,
    network,
    isNative: token.isNative === true,
    ...(token.aliases?.length ? { aliases: token.aliases } : {}),
  };
}

export function registerEvmToken(program: Command) {
  const cmd = program
    .command("token")
    .description(
      "Look up known token addresses by symbol (ETH, USDC, WETH, etc.)",
    )
    .argument("[symbol]", "Token symbol (e.g. ETH, USDC, WETH)")
    .option("--address-only", "Print only the resolved address (for scripting)")
    .addHelpText(
      "after",
      `
Symbols are matched case-insensitively. \`USDC\` resolves to the canonical
Circle-issued token; \`USDC.e\` resolves to the legacy bridged variant where
applicable. The native gas token (ETH, POL, BNB, AVAX, …) resolves to the
EIP-7528 native sentinel 0xEeee…EEeE.

Examples:
  alchemy evm token ETH -n eth-mainnet
  alchemy evm token USDC -n base-mainnet
  alchemy evm token USDC.e -n arb-mainnet
  alchemy evm token USDC --address-only -n base-mainnet
  alchemy --json evm token USDC -n base-mainnet | jq -r .address

  alchemy evm token list -n eth-mainnet
  alchemy evm token list --all                    # list tokens across all networks`,
    )
    .action(async (symbol: string | undefined, opts: LookupOpts) => {
      try {
        if (!symbol) {
          if (opts.addressOnly) {
            throw errInvalidArgs(
              "--address-only requires a symbol. Example: alchemy evm token USDC --address-only -n base-mainnet",
            );
          }
          await runList(program, {});
          return;
        }
        await runLookup(program, symbol, opts);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("list")
    .description("List known token symbols and addresses")
    .option("--all", "List tokens across all supported networks")
    .action(async (opts: ListOpts) => {
      try {
        await runList(program, opts);
      } catch (err) {
        exitWithError(err);
      }
    });
}

async function runLookup(
  program: Command,
  symbol: string,
  opts: LookupOpts,
): Promise<void> {
  const network = resolveNetwork(program);
  const token = findRegistryToken(network, symbol);

  if (!token) {
    const supported = registrySymbolSuggestions(network);
    if (supported.length === 0) {
      throw errInvalidArgs(
        `No token registry entries for network ${network}. Run 'alchemy evm token list --all' to see supported networks, or pass the raw 0x address.`,
      );
    }
    throw errNotFound(
      `token symbol "${symbol}" on ${network}. Known symbols: ${supported.join(", ")}.`,
    );
  }

  if (opts.addressOnly) {
    console.log(token.address);
    return;
  }

  if (isJSONMode()) {
    printJSON(tokenJSON(token, network));
    return;
  }

  const pairs: [string, string][] = [
    ["Symbol", green(token.symbol)],
    ["Name", token.name],
    ["Address", token.address],
    ["Decimals", String(token.decimals)],
    ["Network", network],
  ];
  if (token.isNative) pairs.push(["Native", "yes"]);
  if (token.aliases?.length) pairs.push(["Aliases", token.aliases.join(", ")]);

  printKeyValue(pairs);
}

async function runList(program: Command, opts: ListOpts): Promise<void> {
  if (opts.all) {
    const data = getRegistryNetworks().map((network) => ({
      network,
      tokens: listRegistryTokens(network),
    }));

    if (isJSONMode()) {
      printJSON(
        data.map(({ network, tokens }) => ({
          network,
          tokens: tokens.map((t) => tokenJSON(t, network)),
        })),
      );
      return;
    }

    for (let i = 0; i < data.length; i++) {
      const { network, tokens } = data[i];
      if (i > 0) console.log("");
      console.log(`  ${green(network)}  ${dim(`(${tokens.length} tokens)`)}`);
      printTokenTable(tokens);
    }
    console.log(
      `\n  ${dim("Tip: pass -n/--network <net> to scope a lookup. Use 'alchemy evm token <SYMBOL> -n <net>' to fetch a single address.")}`,
    );
    return;
  }

  const network = resolveNetwork(program);
  const tokens = listRegistryTokens(network);

  if (isJSONMode()) {
    printJSON({ network, tokens: tokens.map((t) => tokenJSON(t, network)) });
    return;
  }

  if (tokens.length === 0) {
    console.log(
      `\n  ${dim(`No registry entries for ${network}. Supported networks: ${getRegistryNetworks().join(", ")}.`)}`,
    );
    return;
  }

  console.log(`  ${green(network)}  ${dim(`(${tokens.length} tokens)`)}`);
  printTokenTable(tokens);
  console.log(
    `\n  ${dim("Tip: 'alchemy evm token <SYMBOL> -n <net>' resolves one symbol. Add --all to see every network.")}`,
  );
}

function printTokenTable(tokens: RegistryToken[]): void {
  const rows = tokens.map((t) => [
    t.symbol,
    t.name,
    t.address,
    String(t.decimals),
    t.isNative ? "yes" : "",
  ]);
  printTable(["Symbol", "Name", "Address", "Decimals", "Native"], rows);
}
