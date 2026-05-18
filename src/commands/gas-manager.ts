import { Command } from "commander";
import {
  gasManagerClientFromFlags,
  resolveAppId,
  resolveNetwork,
  resolveSolanaNetwork,
} from "../lib/resolve.js";
import {
  errAppRequired,
  errInvalidArgs,
  exitWithError,
} from "../lib/errors.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { dim, green, printKeyValue, printTable, withSpinner } from "../lib/ui.js";
import {
  toAdminNetworkId,
  fromAdminNetworkId,
} from "../lib/networks.js";
import { createPolicyInteractive } from "../lib/policy-prompt.js";
import { isInteractiveAllowed } from "../lib/interaction.js";
import type {
  Policy,
  PolicyType,
  PolicyStatus,
} from "../lib/gas-manager-client.js";

interface ListOpts {
  appId?: string;
  type?: string;
  network?: string;
  status?: string;
}

function summariseNetworks(p: Policy): string {
  return p.networks.map(fromAdminNetworkId).join(", ");
}

function policyToRow(p: Policy): string[] {
  return [
    p.policyId,
    p.policyName,
    p.policyType,
    p.status === "active" ? green(p.status) : dim(p.status),
    summariseNetworks(p) || dim("(none)"),
  ];
}

function policyToJSON(p: Policy) {
  return {
    policyId: p.policyId,
    policyName: p.policyName,
    policyType: p.policyType,
    status: p.status,
    appId: p.appId,
    networks: p.networks,
    networkSlugs: p.networks.map(fromAdminNetworkId),
    policyState: p.policyState ?? null,
    lastUpdatedUnix: p.lastUpdatedUnix ?? null,
    policyVersion: p.policyVersion ?? null,
  };
}

function requireAppId(program: Command, opts: ListOpts): string {
  if (opts.appId) return opts.appId;
  const resolved = resolveAppId(program);
  if (!resolved) throw errAppRequired();
  return resolved;
}

function parseTypeFilter(value: string | undefined): PolicyType | null {
  if (!value) return null;
  if (value === "sponsorship" || value === "erc20" || value === "solana") return value;
  throw errInvalidArgs(`Unknown --type ${value}. Expected one of: sponsorship, erc20, solana.`);
}

function parseStatusFilter(value: string | undefined): PolicyStatus | null {
  if (!value) return null;
  if (value === "active" || value === "inactive") return value;
  throw errInvalidArgs(`Unknown --status ${value}. Expected one of: active, inactive.`);
}

export function registerGasManager(program: Command) {
  const cmd = program
    .command("gas-manager")
    .description("Manage Alchemy Gas Manager policies");

  const policyCmd = cmd.command("policy").description("Manage gas sponsorship policies");

  // ── list ──────────────────────────────────────────────────────────

  policyCmd
    .command("list")
    .description("List gas policies for the default app")
    .option("--app-id <id>", "Override the default app ID")
    .option("--type <type>", "Filter by policy type (sponsorship | erc20 | solana)")
    .option("--network <slug>", "Filter by network slug (e.g. eth-mainnet)")
    .option("--status <status>", "Filter by status (active | inactive)")
    .action(async (opts: ListOpts) => {
      try {
        // Auth check first — if the user isn't logged in, that's the most
        // helpful primary error.
        const client = gasManagerClientFromFlags(program);
        const appId = requireAppId(program, opts);
        const typeFilter = parseTypeFilter(opts.type);
        const statusFilter = parseStatusFilter(opts.status);
        const networkFilter = opts.network ? toAdminNetworkId(opts.network) : null;
        const policies = await withSpinner("Fetching policies…", "Policies fetched", () =>
          client.listAllPolicies({ appId }),
        );

        const filtered = policies.filter((p) => {
          if (typeFilter && p.policyType !== typeFilter) return false;
          if (statusFilter && p.status !== statusFilter) return false;
          if (networkFilter && !p.networks.includes(networkFilter)) return false;
          return true;
        });

        if (isJSONMode()) {
          printJSON({ appId, policies: filtered.map(policyToJSON) });
          return;
        }

        if (filtered.length === 0) {
          console.log(
            `\n  ${dim(`No policies for app ${appId}${networkFilter ? ` on ${opts.network}` : ""}.`)}`,
          );
          console.log(
            `  ${dim("Create one with: alchemy gas-manager policy create")}`,
          );
          return;
        }

        printTable(
          ["Policy ID", "Name", "Type", "Status", "Networks"],
          filtered.map(policyToRow),
        );
        console.log(`\n  ${dim(`${filtered.length} policies (app ${appId}).`)}`);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── get ───────────────────────────────────────────────────────────

  policyCmd
    .command("get <policy-id>")
    .description("Show details for a single policy")
    .action(async (policyId: string) => {
      try {
        const client = gasManagerClientFromFlags(program);
        const policy = await withSpinner("Fetching policy…", "Policy fetched", () =>
          client.getPolicy(policyId),
        );

        if (isJSONMode()) {
          printJSON(policyToJSON(policy));
          return;
        }

        printKeyValue([
          ["Policy ID", policy.policyId],
          ["Name", policy.policyName],
          ["Type", policy.policyType],
          ["Status", policy.status === "active" ? green("active") : dim(policy.status)],
          ["App", policy.appId],
          ["Networks", summariseNetworks(policy) || dim("(none)")],
          ...(policy.lastUpdatedUnix ? [["Updated", policy.lastUpdatedUnix] as [string, string]] : []),
        ]);
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── create ────────────────────────────────────────────────────────

  policyCmd
    .command("create")
    .description("Create a new gas policy interactively")
    .option("--type <type>", "Policy type (sponsorship | solana)", "sponsorship")
    .action(async (opts: { type?: string }) => {
      try {
        const type = parseTypeFilter(opts.type ?? "sponsorship");
        if (type === "erc20") {
          throw errInvalidArgs(
            "ERC-20 policies are not supported in `gas-manager policy create` yet. Create them in the Alchemy dashboard.",
          );
        }
        if (!isInteractiveAllowed(program)) {
          throw errInvalidArgs(
            "Policy creation requires an interactive terminal. Create policies in the Alchemy dashboard for non-interactive environments.",
          );
        }

        const flavor = type === "solana" ? "solana" : "sponsorship";
        const network = flavor === "solana"
          ? resolveSolanaNetwork(program)
          : resolveNetwork(program);

        const result = await createPolicyInteractive({
          flavor,
          network,
          program,
        });

        // User cancelled the prompt — exit cleanly with no error.
        if (!result) return;

        if (isJSONMode()) {
          printJSON({
            policyId: result.policyId,
            status: result.status,
            activated: result.activated,
          });
        }
      } catch (err) {
        exitWithError(err);
      }
    });

  // ── activate ──────────────────────────────────────────────────────

  policyCmd
    .command("activate <policy-id>")
    .description("Activate a policy so it can be used for sponsorship")
    .action(async (policyId: string) => {
      try {
        const client = gasManagerClientFromFlags(program);
        const policy = await withSpinner("Activating policy…", "Policy active", () =>
          client.setPolicyStatus(policyId, "active"),
        );

        if (isJSONMode()) {
          printJSON(policyToJSON(policy));
          return;
        }

        printKeyValue([
          ["Policy ID", policy.policyId],
          ["Name", policy.policyName],
          ["Status", green(policy.status)],
        ]);
      } catch (err) {
        exitWithError(err);
      }
    });
}
