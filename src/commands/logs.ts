import { Command } from "commander";
import { clientFromFlags, resolveNetwork } from "../lib/resolve.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { errInvalidArgs, exitWithError } from "../lib/errors.js";
import { dim, withSpinner, printTable } from "../lib/ui.js";
import { formatHexQuantity } from "../lib/block-format.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import { promptSelect } from "../lib/terminal-ui.js";

const PAGE_SIZE = 25;
const LARGE_PAGE_SIZE = 100;

function normalizeBlockParam(value: string): string {
  if (value === "latest" || value === "earliest" || value === "pending") {
    return value;
  }
  if (value.startsWith("0x")) return value;
  const num = parseInt(value, 10);
  if (isNaN(num) || num < 0) {
    throw errInvalidArgs("Block must be a number, hex, or tag (latest, earliest, pending).");
  }
  return `0x${num.toString(16)}`;
}

interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
}

function formatLogRows(logs: LogEntry[]): string[][] {
  return logs.map((log) => {
    const block = formatHexQuantity(log.blockNumber) ?? log.blockNumber;
    const idx = formatHexQuantity(log.logIndex) ?? log.logIndex;
    const topic0 = log.topics[0]
      ? `${log.topics[0].slice(0, 10)}…`
      : dim("none");
    const addr = log.address;
    const txHash = `${log.transactionHash.slice(0, 10)}…`;
    return [block, idx, addr, topic0, txHash];
  });
}

const TABLE_HEADERS = ["Block", "Index", "Address", "Topic0", "Tx Hash"];

type PaginationAction = "next" | "next-large" | "stop";

async function promptPaginationAction(shown: number, total: number): Promise<PaginationAction> {
  const remaining = total - shown;
  const options: Array<{ label: string; value: PaginationAction }> = [
    { label: `Show next ${Math.min(PAGE_SIZE, remaining)}`, value: "next" },
  ];
  if (remaining > PAGE_SIZE) {
    options.push({ label: `Show next ${Math.min(LARGE_PAGE_SIZE, remaining)}`, value: "next-large" });
  }
  options.push({ label: "Stop here", value: "stop" });

  const action = await promptSelect({
    message: `Showing ${shown} of ${total} logs (${remaining} remaining)`,
    options,
    initialValue: "next",
    cancelMessage: "Stopped pagination.",
  });
  if (action === null) return "stop";
  return action as PaginationAction;
}

export function registerLogs(program: Command) {
  program
    .command("logs")
    .description("Query event logs (eth_getLogs)")
    .addHelpText(
      "after",
      `
Examples:
  alchemy logs --from-block 18000000 --to-block 18000010
  alchemy logs --address 0xdAC17F958D2ee523a2206206994597C13D831ec7 --from-block 18000000 --to-block 18000010
  alchemy logs --address 0xdAC17F958D2ee523a2206206994597C13D831ec7 --topic 0xddf252ad...
  alchemy logs --from-block latest --json`,
    )
    .option("--address <address>", "Contract address to filter logs")
    .option("--topic <topic...>", "Event topic(s) to filter (topic0, topic1, ...)")
    .option("--from-block <block>", "Start block (number, hex, or tag)", "latest")
    .option("--to-block <block>", "End block (number, hex, or tag)", "latest")
    .action(async (opts: { address?: string; topic?: string[]; fromBlock: string; toBlock: string }) => {
      try {
        const filter: Record<string, unknown> = {
          fromBlock: normalizeBlockParam(opts.fromBlock),
          toBlock: normalizeBlockParam(opts.toBlock),
        };

        if (opts.address) {
          filter.address = opts.address;
        }

        if (opts.topic && opts.topic.length > 0) {
          filter.topics = opts.topic;
        }

        const client = clientFromFlags(program);
        const logs = await withSpinner("Fetching logs…", "Logs fetched", () =>
          client.call("eth_getLogs", [filter]),
        ) as LogEntry[];

        const network = resolveNetwork(program);

        if (isJSONMode()) {
          printJSON({ logs, count: logs.length, network });
          return;
        }

        if (logs.length === 0) {
          console.log(dim("No logs found for the given filter."));
          return;
        }

        const total = logs.length;
        const interactive = isInteractiveAllowed(program);

        if (!interactive) {
          // Non-TTY: print everything
          console.log(`Found ${total} log${total === 1 ? "" : "s"} on ${network}\n`);
          printTable(TABLE_HEADERS, formatLogRows(logs));
        } else {
          // TTY: paginate interactively
          let offset = 0;
          const firstPage = logs.slice(0, PAGE_SIZE);
          console.log(`Found ${total} log${total === 1 ? "" : "s"} on ${network}\n`);
          printTable(TABLE_HEADERS, formatLogRows(firstPage));
          offset = firstPage.length;

          while (offset < total) {
            const action = await promptPaginationAction(offset, total);

            if (action === "stop") break;

            const size = action === "next-large" ? LARGE_PAGE_SIZE : PAGE_SIZE;
            const page = logs.slice(offset, offset + size);
            console.log("");
            printTable(TABLE_HEADERS, formatLogRows(page));
            offset += page.length;
          }
        }

        if (total >= 10000) {
          console.log("");
          console.log(dim("⚠ RPC result limit reached (10,000). Narrow your block range for complete results."));
        }
      } catch (err) {
        exitWithError(err);
      }
    });
}
