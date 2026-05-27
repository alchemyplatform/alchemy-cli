import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import { mcpAdminClient } from "../clients/admin.js";
import {
  requireAuth,
  getSelectedApp,
  toolResult,
  handleToolError,
  formatResult,
  AppNotSelectedError,
} from "./helpers.js";
import { toAdminNetworkId } from "@alchemy/sdk/networks";
import type {
  CreateGasPolicyPayload,
  GasSponsorshipRules,
  GasPolicy,
  SolanaGasPolicyRules,
} from "@alchemy/sdk/admin";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const STATUS_WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

interface CreateGasPolicyToolArgs {
  app_id?: string;
  policy_name: string;
  policy_type: "sponsorship" | "solana";
  networks: string[];
  start_time_unix?: string;
  end_time_unix?: string;
  sponsorship_expiry_ms?: string;
  max_spend_usd?: string;
  max_spend_per_sender_usd?: string;
  max_spend_per_uo_usd?: string;
  max_spend_per_txn_usd?: string;
  max_count?: string;
  max_count_per_sender?: string;
  sender_allowlist?: string[];
  sender_blocklist?: string[];
  webhook_url?: string;
  approve_on_failure?: boolean;
}

async function resolveAppId(
  authInfo: { token?: string } | undefined,
  appId?: string,
): Promise<string> {
  if (appId) return appId;
  const selectedApp = await getSelectedApp(authInfo);
  if (!selectedApp.appId) throw new AppNotSelectedError();
  return selectedApp.appId;
}

function formatPolicy(policy: GasPolicy): string {
  return [
    `Policy ID: ${policy.policyId}`,
    `Name: ${policy.policyName}`,
    `Type: ${policy.policyType}`,
    `Status: ${policy.status}`,
    `App ID: ${policy.appId}`,
    `Networks: ${policy.networks.join(", ") || "(none)"}`,
  ].join("\n");
}

function normalizeNetworks(networks: string[]): string[] {
  return networks.map(toAdminNetworkId);
}

function maybeString(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function buildSponsorshipRules(args: {
  start_time_unix?: string;
  end_time_unix?: string;
  sponsorship_expiry_ms?: string;
  max_spend_usd?: string;
  max_spend_per_sender_usd?: string;
  max_spend_per_uo_usd?: string;
  max_count?: string;
  max_count_per_sender?: string;
  sender_allowlist?: string[];
  sender_blocklist?: string[];
  webhook_url?: string;
  approve_on_failure?: boolean;
}): GasSponsorshipRules {
  return {
    ...(maybeString(args.start_time_unix) && { startTimeUnix: args.start_time_unix }),
    ...(maybeString(args.end_time_unix) && { endTimeUnix: args.end_time_unix }),
    ...(maybeString(args.sponsorship_expiry_ms) && { sponsorshipExpiryMs: args.sponsorship_expiry_ms }),
    ...(maybeString(args.max_spend_usd) && { maxSpendUsd: args.max_spend_usd }),
    ...(maybeString(args.max_spend_per_sender_usd) && { maxSpendPerSenderUsd: args.max_spend_per_sender_usd }),
    ...(maybeString(args.max_spend_per_uo_usd) && { maxSpendPerUoUsd: args.max_spend_per_uo_usd }),
    ...(maybeString(args.max_count) && { maxCount: args.max_count }),
    ...(maybeString(args.max_count_per_sender) && { maxCountPerSender: args.max_count_per_sender }),
    ...(args.sender_allowlist && { senderAllowlist: args.sender_allowlist }),
    ...(args.sender_blocklist && { senderBlocklist: args.sender_blocklist }),
    ...(args.webhook_url && {
      webhookRules: {
        webhookUrl: args.webhook_url,
        approveOnFailure: args.approve_on_failure ?? false,
      },
    }),
  };
}

function buildSolanaRules(args: {
  start_time_unix?: string;
  end_time_unix?: string;
  max_spend_usd?: string;
  max_spend_per_txn_usd?: string;
  max_count?: string;
}): SolanaGasPolicyRules {
  return {
    ...(maybeString(args.start_time_unix) && { startTimeUnix: args.start_time_unix }),
    ...(maybeString(args.end_time_unix) && { endTimeUnix: args.end_time_unix }),
    ...(maybeString(args.max_spend_usd) && { maxSpendUsd: args.max_spend_usd }),
    ...(maybeString(args.max_spend_per_txn_usd) && { maxSpendPerTxnUsd: args.max_spend_per_txn_usd }),
    ...(maybeString(args.max_count) && { maxCount: args.max_count }),
  };
}

function buildCreatePayload(args: CreateGasPolicyToolArgs & { app_id: string }): CreateGasPolicyPayload {
  if (args.policy_type === "solana") {
    return {
      policyName: args.policy_name,
      policyType: "solana",
      appId: args.app_id,
      networks: normalizeNetworks(args.networks),
      solanaRules: buildSolanaRules(args),
    };
  }

  return {
    policyName: args.policy_name,
    policyType: "sponsorship",
    appId: args.app_id,
    networks: normalizeNetworks(args.networks),
    rules: buildSponsorshipRules(args),
  };
}

export function registerGasManagerTools(server: InstrumentedServer): void {
  server.tool(
    "list_gas_policies",
    "Lists Gas Manager policies for an app. Use select_app first or pass app_id. Filter by policy_type, status, or network using either an Admin network ID like ETH_MAINNET or an RPC slug like eth-mainnet.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      limit: z.number().int().positive().max(100).default(100).describe("Max policies per API page."),
      policy_type: z.enum(["sponsorship", "erc20", "solana"]).optional().describe("Optional policy type filter."),
      status: z.enum(["active", "inactive"]).optional().describe("Optional policy status filter."),
      network: z.string().optional().describe("Optional network filter, e.g. ETH_MAINNET, SOLANA_MAINNET, eth-mainnet, or solana-mainnet."),
    },
    READ_ONLY,
    async ({ app_id, limit, policy_type, status, network }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const appId = await resolveAppId(authInfo, app_id);
        const networkFilter = network ? toAdminNetworkId(network) : undefined;
        const policies = await mcpAdminClient.listAllGasManagerPolicies(token, { appId, limit });
        const filtered = policies.filter((policy) => {
          if (policy_type && policy.policyType !== policy_type) return false;
          if (status && policy.status !== status) return false;
          if (networkFilter && !policy.networks.includes(networkFilter)) return false;
          return true;
        });
        return toolResult(formatResult({ appId, policies: filtered }));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "get_gas_policy",
    "Gets a single Gas Manager policy by policy_id. Use list_gas_policies first if the policy_id is unknown.",
    {
      policy_id: z.string().describe("Gas Manager policy ID."),
    },
    READ_ONLY,
    async ({ policy_id }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const policy = await mcpAdminClient.getGasManagerPolicy(token, policy_id);
        return toolResult(formatResult(policy));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "create_gas_policy",
    "Creates a Gas Manager policy for an app. Accepts Admin network IDs like ETH_MAINNET or RPC slugs like eth-mainnet. Supports sponsorship and solana policy types.",
    {
      app_id: z.string().optional().describe("Alchemy app ID. If omitted, uses the selected app from select_app."),
      policy_name: z.string().describe("Human-readable policy name."),
      policy_type: z.enum(["sponsorship", "solana"]).default("sponsorship").describe("Policy type to create."),
      networks: z.array(z.string()).min(1).describe("Admin network IDs or RPC slugs, e.g. ETH_MAINNET, SOLANA_MAINNET, eth-mainnet, or solana-mainnet."),
      start_time_unix: z.string().optional().describe("Optional Unix start time as a string."),
      end_time_unix: z.string().optional().describe("Optional Unix end time as a string."),
      sponsorship_expiry_ms: z.string().optional().describe("Sponsorship expiry window in milliseconds; sponsorship policies only."),
      max_spend_usd: z.string().optional().describe("Maximum total spend in USD."),
      max_spend_per_sender_usd: z.string().optional().describe("Maximum spend per sender in USD; sponsorship policies only."),
      max_spend_per_uo_usd: z.string().optional().describe("Maximum spend per user operation in USD; sponsorship policies only."),
      max_spend_per_txn_usd: z.string().optional().describe("Maximum spend per transaction in USD; solana policies only."),
      max_count: z.string().optional().describe("Maximum total sponsored operation count."),
      max_count_per_sender: z.string().optional().describe("Maximum operation count per sender; sponsorship policies only."),
      sender_allowlist: z.array(z.string()).optional().describe("Allowed sender addresses; sponsorship policies only."),
      sender_blocklist: z.array(z.string()).optional().describe("Blocked sender addresses; sponsorship policies only."),
      webhook_url: z.string().url().optional().describe("Webhook URL for custom approval checks; sponsorship policies only."),
      approve_on_failure: z.boolean().optional().describe("Whether webhook approval failures should approve by default."),
    },
    WRITE,
    async (rawArgs, { authInfo }) => {
      try {
        const args = rawArgs as CreateGasPolicyToolArgs;
        const token = requireAuth(authInfo);
        const appId = await resolveAppId(authInfo, args.app_id);
        const payload = buildCreatePayload({ ...args, app_id: appId });
        const policy = await mcpAdminClient.createGasManagerPolicy(token, payload);
        return toolResult(`Created Gas Manager policy:\n${formatPolicy(policy)}`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "set_gas_policy_status",
    "Sets a Gas Manager policy status to active or inactive. Inactive policies stop sponsorship; only call after explicit user confirmation.",
    {
      policy_id: z.string().describe("Gas Manager policy ID."),
      status: z.enum(["active", "inactive"]).describe("New policy status."),
    },
    STATUS_WRITE,
    async ({ policy_id, status }, { authInfo }) => {
      try {
        const token = requireAuth(authInfo);
        const policy = await mcpAdminClient.setGasManagerPolicyStatus(token, policy_id, status);
        return toolResult(`Updated Gas Manager policy:\n${formatPolicy(policy)}`);
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
