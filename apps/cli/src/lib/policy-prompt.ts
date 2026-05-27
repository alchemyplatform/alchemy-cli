import { Command } from "commander";
import * as config from "./config.js";
import {
  GasManagerClient,
  type Policy,
  type PolicyType,
} from "./gas-manager-client.js";
import { gasManagerClientFromFlags } from "./resolve.js";
import {
  errAppRequired,
  errInvalidArgs,
  errLoginRequired,
  CLIError,
} from "./errors.js";
import { dim, green, withSpinner } from "./ui.js";
import {
  promptAutocomplete,
  promptText,
  promptConfirm,
} from "./terminal-ui.js";
import { toAdminNetworkId } from "./networks.js";

const CREATE_NEW_SENTINEL = "__create_new__";
const DEFAULT_SPONSORSHIP_EXPIRY_MS = "600000";
const DEFAULT_SOLANA_MAX_COUNT = "1000";

export type PolicyFlavor = "sponsorship" | "solana";

export interface SelectOrCreatePolicyOpts {
  /** EVM `sponsorship` or Solana `solana`. */
  flavor: PolicyFlavor;
  /** Current network slug (e.g. `eth-mainnet`). */
  network: string;
  /** The commander program so we can resolve credentials. */
  program: Command;
  /** Optional pre-built client (mainly for tests / repeat calls). */
  client?: GasManagerClient;
  /** Skip the "save as default?" follow-up prompt. */
  skipPersistPrompt?: boolean;
}

function flavorNoun(flavor: PolicyFlavor): string {
  return flavor === "solana" ? "fee sponsorship" : "gas sponsorship";
}

/**
 * Interactive list-or-create flow used **inline** when `--gas-sponsored` /
 * `--fee-sponsored` is set without a policy id. Returns the selected/created
 * policy ID, or null if the user cancelled.
 *
 * For the dedicated `gas-manager policy create` command, use
 * `createPolicyInteractive` instead — that always creates and never lists.
 */
export async function selectOrCreatePolicy(
  opts: SelectOrCreatePolicyOpts,
): Promise<string | null> {
  const cfg = config.load();
  const appId = cfg.app?.id;
  if (!appId) throw errAppRequired();

  const client = opts.client ?? gasManagerClientFromFlags(opts.program);
  const flavorLabel = flavorNoun(opts.flavor);

  const policies = await withSpinner("Fetching gas policies…", "Policies fetched", () =>
    client.listAllPolicies({ appId }),
  );

  const matching = filterPolicies(policies, opts.flavor, opts.network);

  let selectedId: string | null = null;

  if (matching.length === 0) {
    console.log(
      `  ${dim(`No ${flavorLabel} policies found for ${opts.network} on app ${appId}. Let's create one.`)}`,
    );
    const created = await runCreate(opts, client, appId);
    if (!created) return null;
    selectedId = created.policyId;
  } else {
    const selected = await promptAutocomplete<string>({
      message: `Select a ${flavorLabel} policy for ${opts.network}`,
      placeholder: "Policy name or ID",
      options: [
        ...matching.map((p) => ({
          label: formatPolicyOption(p),
          value: p.policyId,
        })),
        { label: "Create a new policy", value: CREATE_NEW_SENTINEL },
      ],
      cancelMessage: "Cancelled policy selection.",
      commitLabel: null,
    });

    if (selected === null) return null;

    if (selected === CREATE_NEW_SENTINEL) {
      const created = await runCreate(opts, client, appId);
      if (!created) return null;
      selectedId = created.policyId;
    } else {
      selectedId = selected;
    }
  }

  if (!opts.skipPersistPrompt && selectedId) {
    await maybePersist(opts.flavor, selectedId);
  }

  return selectedId;
}

export interface CreatePolicyResult {
  policyId: string;
  status: "created";
  activated: boolean;
}

/**
 * Pure create flow used by `gas-manager policy create`. Always creates a new
 * policy — never lists or offers existing ones (per code review feedback that
 * `create` should not silently select pre-existing policies). Returns null if
 * the user cancels.
 */
export async function createPolicyInteractive(
  opts: SelectOrCreatePolicyOpts,
): Promise<CreatePolicyResult | null> {
  const cfg = config.load();
  const appId = cfg.app?.id;
  if (!appId) throw errAppRequired();

  const client = opts.client ?? gasManagerClientFromFlags(opts.program);
  const result = await runCreate(opts, client, appId);
  return result;
}

function filterPolicies(
  policies: Policy[],
  flavor: PolicyFlavor,
  network: string,
): Policy[] {
  const adminId = toAdminNetworkId(network);
  return policies.filter((p) => {
    if (p.policyType !== flavor) return false;
    if (!Array.isArray(p.networks)) return false;
    return p.networks.includes(adminId);
  });
}

function formatPolicyOption(p: Policy): string {
  const status = p.status === "active" ? green("active") : dim(p.status);
  return `${p.policyName} (${p.policyId.slice(0, 10)}…) — ${status}`;
}

async function runCreate(
  opts: SelectOrCreatePolicyOpts,
  client: GasManagerClient,
  appId: string,
): Promise<CreatePolicyResult | null> {
  const name = await promptText({
    message: "Policy name",
    cancelMessage: "Cancelled policy creation.",
  });
  if (name === null) return null;
  if (!name.trim()) {
    console.log(`  ${dim("Skipped policy creation (no name).")}`);
    return null;
  }

  const adminNetworkId = toAdminNetworkId(opts.network);
  const nowUnix = String(Math.floor(Date.now() / 1000));

  const payload: import("./gas-manager-client.js").CreatePolicyPayload =
    opts.flavor === "sponsorship"
      ? {
          policyName: name.trim(),
          policyType: "sponsorship",
          appId,
          networks: [adminNetworkId],
          rules: {
            startTimeUnix: nowUnix,
            sponsorshipExpiryMs: DEFAULT_SPONSORSHIP_EXPIRY_MS,
          },
        }
      : {
          policyName: name.trim(),
          policyType: "solana",
          appId,
          networks: [adminNetworkId],
          solanaRules: {
            startTimeUnix: nowUnix,
            maxCount: DEFAULT_SOLANA_MAX_COUNT,
          },
        };

  const created = await withSpinner("Creating policy…", "Policy created", () =>
    client.createPolicy(payload),
  );
  console.log(`  ${green("✓")} Created ${created.policyName} (${created.policyId})`);

  const activate = await promptConfirm({
    message: "Activate this policy now? (required before use)",
    initialValue: true,
    cancelMessage: "Skipped activation.",
  });
  let activated = false;
  if (activate === true) {
    await withSpinner("Activating policy…", "Policy active", () =>
      client.setPolicyStatus(created.policyId, "active"),
    );
    activated = true;
  } else {
    console.log(
      `  ${dim("Policy left inactive. Activate later with `alchemy gas-manager policy activate " + created.policyId + "`.")}`,
    );
  }

  return { policyId: created.policyId, status: "created", activated };
}

async function maybePersist(flavor: PolicyFlavor, policyId: string): Promise<void> {
  const confirmed = await promptConfirm({
    message: "Save as default policy for this CLI?",
    initialValue: true,
    cancelMessage: "Skipped saving default.",
  });
  if (confirmed !== true) return;

  const cfg = config.load();
  const updated =
    flavor === "sponsorship"
      ? { ...cfg, evm_gas_policy_id: policyId }
      : { ...cfg, solana_fee_policy_id: policyId };
  config.save(updated);
  const key = flavor === "sponsorship" ? "evm-gas-policy-id" : "solana-fee-policy-id";
  console.log(`  ${green("✓")} Saved ${key} = ${policyId}`);
}

/**
 * Returns a typed error indicating that the user passed --gas-sponsored
 * (or --fee-sponsored) without a policy ID in a non-interactive context,
 * with guidance that points at the new command surface.
 */
export function errSponsorshipNeedsPolicy(flavor: PolicyFlavor): CLIError {
  const flag = flavor === "sponsorship" ? "--gas-policy-id" : "--fee-policy-id";
  const label = flavor === "sponsorship" ? "Gas sponsorship" : "Fee sponsorship";
  return errInvalidArgs(
    `${label} requires a policy ID. Run 'alchemy gas-manager policy list' to pick one, pass ${flag} <id>, or run interactively to be prompted.`,
  );
}

/**
 * Returns a typed error indicating that the prompt would have run but the
 * user is not signed in via `alchemy auth login`. Gas Manager flows do
 * Requires the login auth token; this is intentional.
 */
export function errNotLoggedInForPolicyLookup(): CLIError {
  return errLoginRequired();
}
