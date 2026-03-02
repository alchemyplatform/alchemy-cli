import { Command } from "commander";
import { adminClientFromFlags } from "../lib/resolve.js";
import type { App } from "../lib/admin-client.js";
import { errInvalidArgs } from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { exitWithError } from "../index.js";
import {
  green,
  dim,
  withSpinner,
  printTable,
  printKeyValueBox,
  emptyState,
  maskIf,
} from "../lib/ui.js";

function maskAppSecrets<T extends { apiKey?: string; webhookApiKey?: string }>(app: T): T {
  return {
    ...app,
    ...(app.apiKey !== undefined && { apiKey: maskIf(app.apiKey) }),
    ...(app.webhookApiKey !== undefined && { webhookApiKey: maskIf(app.webhookApiKey) }),
  };
}

function printFetchSummary(
  appsCount: number,
  pagesCount: number,
  opts?: { suffix?: string },
): void {
  const suffix = opts?.suffix ? ` ${opts.suffix}` : "";
  console.log(`\n  ${dim(`Fetched ${appsCount} apps across ${pagesCount} pages${suffix}`)}`);
}

type PaginationAction = "next" | "all" | "stop";

async function promptPaginationAction(): Promise<PaginationAction> {
  const { select, isCancel, cancel } = await import("@clack/prompts");
  const action = await select({
    message: "More apps are available. What do you want to do?",
    options: [
      { label: "Load next page", value: "next" },
      { label: "Load all remaining pages", value: "all" },
      { label: "Stop here", value: "stop" },
    ],
    initialValue: "next",
  });

  if (isCancel(action)) {
    cancel("Stopped pagination.");
    return "stop";
  }

  if (action === "next" || action === "all" || action === "stop") {
    return action;
  }
  return "stop";
}

async function listAllApps(
  listApps: (opts?: { cursor?: string; limit?: number }) => Promise<{ apps: App[]; cursor?: string }>,
  opts?: { limit?: number },
): Promise<{ apps: Awaited<ReturnType<typeof listApps>>["apps"]; pages: number }> {
  const apps: Awaited<ReturnType<typeof listApps>>["apps"] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;

  do {
    const page = await listApps({
      ...(cursor && { cursor }),
      ...(opts?.limit !== undefined && { limit: opts.limit }),
    });
    pages += 1;
    apps.push(...page.apps);
    cursor = page.cursor;
    if (cursor && seenCursors.has(cursor)) break;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return { apps, pages };
}

function matchesSearch(app: App, query: string): boolean {
  const q = query.toLowerCase();
  return app.name.toLowerCase().includes(q) || app.id.toLowerCase().includes(q);
}

export function registerApps(program: Command) {
  const cmd = program.command("apps").description("Manage Alchemy apps");

  // ── apps list ──────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List all apps")
    .option("--cursor <cursor>", "Pagination cursor")
    .option("--limit <n>", "Max results per page", parseInt)
    .option("--all", "Fetch all pages")
    .option("--search <query>", "Search apps by name or id (client-side)")
    .option("--id <appId>", "Filter by exact app id (client-side)")
    .action(async (opts) => {
      try {
        const admin = adminClientFromFlags(program);
        const fetchAll = Boolean(opts.all);
        const hasSearch = typeof opts.search === "string";
        const hasId = typeof opts.id === "string";
        const searchQuery = hasSearch ? opts.search.trim() : "";
        const idQuery = hasId ? opts.id.trim() : "";

        if (opts.all && opts.cursor) {
          throw errInvalidArgs("Cannot combine --all with --cursor");
        }
        if (hasSearch && hasId) {
          throw errInvalidArgs("Cannot combine --search with --id");
        }
        if (opts.cursor && (hasSearch || hasId)) {
          throw errInvalidArgs("Cannot combine --cursor with --search or --id");
        }
        if (hasSearch && !searchQuery) {
          throw errInvalidArgs("--search cannot be empty");
        }
        if (hasId && !idQuery) {
          throw errInvalidArgs("--id cannot be empty");
        }

        const isFilteredList = hasSearch || hasId;
        if (fetchAll || isFilteredList) {
          const result = await withSpinner("Fetching apps…", "Apps fetched", () =>
            listAllApps(admin.listApps.bind(admin), { limit: opts.limit }),
          );
          const filteredApps = hasId
            ? result.apps.filter((a) => a.id === idQuery)
            : hasSearch
              ? result.apps.filter((a) => matchesSearch(a, searchQuery))
              : result.apps;

          if (isJSONMode()) {
            printJSON({
              apps: filteredApps.map(maskAppSecrets),
              pageInfo: {
                mode: fetchAll ? "all" : "search",
                pages: result.pages,
                scannedApps: result.apps.length,
                ...(hasSearch && { search: searchQuery }),
                ...(hasId && { id: idQuery }),
              },
            });
            return;
          }

          if (filteredApps.length === 0) {
            emptyState(
              hasId
                ? `No apps found with id "${idQuery}".`
                : hasSearch
                  ? `No apps found matching "${searchQuery}".`
                  : "No apps found.",
            );
            printFetchSummary(result.apps.length, result.pages);
            return;
          }

          const rows = filteredApps.map((a) => [
            a.id,
            a.name,
            String(a.chainNetworks.length),
            a.createdAt,
          ]);

          printTable(["ID", "Name", "Networks", "Created"], rows);
          if (isFilteredList) {
            const filterLabel = hasId ? `id "${idQuery}"` : `"${searchQuery}"`;
            console.log(`\n  ${dim(`Matched ${filteredApps.length} apps for ${filterLabel}`)}`);
          }
          printFetchSummary(result.apps.length, result.pages);
          return;
        }

        const result = await withSpinner("Fetching apps…", "Apps fetched", () =>
          admin.listApps({ cursor: opts.cursor, limit: opts.limit }),
        );

        if (isJSONMode()) {
          printJSON({ ...result, apps: result.apps.map(maskAppSecrets) });
          return;
        }

        const interactivePagination = process.stdin.isTTY && !opts.all;
        if (interactivePagination) {
          let page = result;
          let autoFetchRemaining = false;
          let pagesFetched = 0;
          let appsFetched = 0;

          while (true) {
            if (page.apps.length > 0) {
              pagesFetched += 1;
              appsFetched += page.apps.length;
              const rows = page.apps.map((a) => [
                a.id,
                a.name,
                String(a.chainNetworks.length),
                a.createdAt,
              ]);
              printTable(["ID", "Name", "Networks", "Created"], rows);
            } else {
              emptyState("No apps found.");
              return;
            }

            if (!page.cursor) {
              printFetchSummary(appsFetched, pagesFetched);
              return;
            }

            if (!autoFetchRemaining) {
              printFetchSummary(appsFetched, pagesFetched, { suffix: "so far" });
              const action = await promptPaginationAction();
              if (action === "stop") {
                console.log(`\n  ${dim(`Next cursor: ${page.cursor}`)}`);
                printFetchSummary(appsFetched, pagesFetched);
                return;
              }
              if (action === "all") {
                autoFetchRemaining = true;
              }
            }

            page = await withSpinner("Fetching next page…", "Page fetched", () =>
              admin.listApps({ cursor: page.cursor, limit: opts.limit }),
            );
          }
        }

        if (result.apps.length === 0) {
          emptyState("No apps found.");
          return;
        }

        const rows = result.apps.map((a) => [
          a.id,
          a.name,
          String(a.chainNetworks.length),
          a.createdAt,
        ]);

        printTable(["ID", "Name", "Networks", "Created"], rows);
        printFetchSummary(result.apps.length, 1);

        if (result.cursor) {
          console.log(`\n  ${dim(`Next cursor: ${result.cursor}`)}`);
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps get ───────────────────────────────────────────────────────

  cmd
    .command("get <id>")
    .description("Get app details")
    .action(async (id: string) => {
      try {
        const admin = adminClientFromFlags(program);
        const app = await withSpinner("Fetching app…", "App fetched", () =>
          admin.getApp(id),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        const networks = app.chainNetworks.map((n) => n.name).join(", ");
        printKeyValueBox([
          ["ID", app.id],
          ["Name", app.name],
          ...(app.description ? [["Description", app.description] as [string, string]] : []),
          ["API Key", maskIf(app.apiKey)],
          ["Networks", networks || dim("none")],
          ["Created", app.createdAt],
        ]);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps create ────────────────────────────────────────────────────

  cmd
    .command("create")
    .description("Create a new app")
    .requiredOption("--name <name>", "App name")
    .requiredOption("--networks <networks>", "Comma-separated network IDs")
    .option("--description <desc>", "App description")
    .option("--products <products>", "Comma-separated product IDs")
    .option("--dry-run", "Preview without executing")
    .action(async (opts) => {
      try {
        const networks = opts.networks.split(",").map((s: string) => s.trim());
        const products = opts.products
          ? opts.products.split(",").map((s: string) => s.trim())
          : undefined;

        const payload = {
          name: opts.name,
          networks,
          ...(opts.description && { description: opts.description }),
          ...(products && { products }),
        };

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "create", payload });
          } else {
            console.log(`  ${dim("Dry run:")} Would create app "${opts.name}" on networks: ${networks.join(", ")}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner("Creating app…", "App created", () =>
          admin.createApp({
            name: opts.name,
            networks,
            description: opts.description,
            products,
          }),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        printKeyValueBox([
          ["ID", app.id],
          ["Name", app.name],
          ["API Key", maskIf(app.apiKey)],
        ]);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps delete ────────────────────────────────────────────────────

  cmd
    .command("delete <id>")
    .description("Delete an app")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "delete", payload: { id } });
          } else {
            console.log(`  ${dim("Dry run:")} Would delete app ${id}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        await withSpinner("Deleting app…", "App deleted", () =>
          admin.deleteApp(id),
        );

        if (isJSONMode()) {
          printJSON({ id, status: "deleted" });
          return;
        }

        console.log(`  ${green("✓")} Deleted app ${id}`);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps update ────────────────────────────────────────────────────

  cmd
    .command("update <id>")
    .description("Update an app")
    .option("--name <name>", "New app name")
    .option("--description <desc>", "New app description")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        if (!opts.name && !opts.description) {
          throw errInvalidArgs("Provide at least --name or --description");
        }

        const payload = {
          id,
          ...(opts.name && { name: opts.name }),
          ...(opts.description && { description: opts.description }),
        };

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "update", payload });
          } else {
            console.log(`  ${dim("Dry run:")} Would update app ${id}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner("Updating app…", "App updated", () =>
          admin.updateApp(id, {
            name: opts.name,
            description: opts.description,
          }),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        console.log(`  ${green("✓")} Updated app ${app.name}`);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps networks ──────────────────────────────────────────────────

  cmd
    .command("networks <id>")
    .description("Update app network allowlist")
    .requiredOption("--networks <networks>", "Comma-separated network IDs")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        const networks = opts.networks.split(",").map((s: string) => s.trim());

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "networks", payload: { id, networks } });
          } else {
            console.log(`  ${dim("Dry run:")} Would update networks for app ${id}: ${networks.join(", ")}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner(
          "Updating networks…",
          "Networks updated",
          () => admin.updateNetworkAllowlist(id, networks),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        console.log(
          `  ${green("✓")} Updated networks for ${app.name} (${app.chainNetworks.length} networks)`,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps address-allowlist ─────────────────────────────────────────

  cmd
    .command("address-allowlist <id>")
    .description("Update app address allowlist")
    .requiredOption("--addresses <addrs>", "Comma-separated addresses")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        const entries = opts.addresses
          .split(",")
          .map((s: string) => ({ value: s.trim() }));

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "address-allowlist", payload: { id, addresses: entries } });
          } else {
            console.log(`  ${dim("Dry run:")} Would update address allowlist for app ${id}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner(
          "Updating address allowlist…",
          "Address allowlist updated",
          () => admin.updateAddressAllowlist(id, entries),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        console.log(
          `  ${green("✓")} Updated address allowlist for ${app.name}`,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps origin-allowlist ──────────────────────────────────────────

  cmd
    .command("origin-allowlist <id>")
    .description("Update app origin allowlist")
    .requiredOption("--origins <origins>", "Comma-separated origins")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        const entries = opts.origins
          .split(",")
          .map((s: string) => ({ value: s.trim() }));

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "origin-allowlist", payload: { id, origins: entries } });
          } else {
            console.log(`  ${dim("Dry run:")} Would update origin allowlist for app ${id}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner(
          "Updating origin allowlist…",
          "Origin allowlist updated",
          () => admin.updateOriginAllowlist(id, entries),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        console.log(
          `  ${green("✓")} Updated origin allowlist for ${app.name}`,
        );
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── apps ip-allowlist ──────────────────────────────────────────────

  cmd
    .command("ip-allowlist <id>")
    .description("Update app IP allowlist")
    .requiredOption("--ips <ips>", "Comma-separated IP addresses")
    .option("--dry-run", "Preview without executing")
    .action(async (id: string, opts) => {
      try {
        const entries = opts.ips
          .split(",")
          .map((s: string) => ({ value: s.trim() }));

        if (opts.dryRun) {
          if (isJSONMode()) {
            printJSON({ dryRun: true, action: "ip-allowlist", payload: { id, ips: entries } });
          } else {
            console.log(`  ${dim("Dry run:")} Would update IP allowlist for app ${id}`);
          }
          return;
        }

        const admin = adminClientFromFlags(program);
        const app = await withSpinner(
          "Updating IP allowlist…",
          "IP allowlist updated",
          () => admin.updateIpAllowlist(id, entries),
        );

        if (isJSONMode()) {
          printJSON(maskAppSecrets(app));
          return;
        }

        console.log(
          `  ${green("✓")} Updated IP allowlist for ${app.name}`,
        );
      } catch (err) {
        exitWithError(err);
      }
    });
}
