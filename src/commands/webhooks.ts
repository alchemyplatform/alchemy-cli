import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { callNotify } from "../lib/rest.js";
import { withSpinner, printSyntaxJSON, dim } from "../lib/ui.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { parseRequiredJSON } from "../lib/params.js";
import { load as loadConfig } from "../lib/config.js";
import { promptConfirm } from "../lib/terminal-ui.js";
import { isInteractiveAllowed } from "../lib/interaction.js";

function resolveWebhookApiKey(
  opts?: { notifyToken?: string; webhookApiKey?: string },
): string | undefined {
  const cfg = loadConfig();
  return (
    opts?.webhookApiKey ||
    opts?.notifyToken ||
    process.env.ALCHEMY_WEBHOOK_API_KEY ||
    process.env.ALCHEMY_NOTIFY_AUTH_TOKEN ||
    cfg.webhook_api_key ||
    cfg.app?.webhookApiKey
  );
}

export function registerWebhooks(program: Command) {
  const cmd = program.command("webhooks").description("Notify API wrappers");
  cmd
    .option("--webhook-api-key <key>", "Webhook API key")
    .option("--notify-token <token>", "Deprecated alias for webhook API key");

  cmd
    .command("list")
    .description("Lists all existing registered Alchemy webhooks (read-only). USE WHEN: user wants to view, see, audit, or check current webhooks. DOES NOT create or modify webhooks — use `alchemy webhooks create` to register a new one.")
    .action(async () => {
      try {
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Fetching webhooks…", "Webhooks fetched", () =>
          callNotify(token, "/team-webhooks"),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("create")
    .description("Creates and registers a NEW Alchemy webhook endpoint (write operation). USE WHEN: user wants to set up, add, register, or create a webhook for address activity, mined/dropped transactions, etc. DOES NOT list existing webhooks — use `alchemy webhooks list` for that.")
    .requiredOption("--body <json>", "Create webhook JSON payload")
    .option("--dry-run", "Preview without executing")
    .action(async (opts: { body: string; dryRun?: boolean }) => {
      try {
        const payload = parseRequiredJSON(opts.body, "--body");
        if (opts.dryRun) {
          if (isJSONMode()) printJSON({ dryRun: true, action: "create-webhook", payload });
          else {
            console.log(`  ${dim("Dry run:")} Would create webhook`);
            printSyntaxJSON(payload);
          }
          return;
        }
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Creating webhook…", "Webhook created", () =>
          callNotify(token, "/create-webhook", {
            method: "POST",
            body: payload,
          }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("update")
    .description("Update webhook")
    .requiredOption("--body <json>", "Update webhook JSON payload")
    .option("--dry-run", "Preview without executing")
    .action(async (opts: { body: string; dryRun?: boolean }) => {
      try {
        const payload = parseRequiredJSON(opts.body, "--body");
        if (opts.dryRun) {
          if (isJSONMode()) printJSON({ dryRun: true, action: "update-webhook", payload });
          else {
            console.log(`  ${dim("Dry run:")} Would update webhook`);
            printSyntaxJSON(payload);
          }
          return;
        }
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Updating webhook…", "Webhook updated", () =>
          callNotify(token, "/update-webhook", {
            method: "PUT",
            body: payload,
          }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("delete <webhookId>")
    .description("Delete webhook")
    .option("--dry-run", "Preview without executing")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (webhookId: string, opts: { yes?: boolean; dryRun?: boolean }) => {
      try {
        if (opts.dryRun) {
          if (isJSONMode()) printJSON({ dryRun: true, action: "delete-webhook", payload: { webhookId } });
          else console.log(`  ${dim("Dry run:")} Would delete webhook ${webhookId}`);
          return;
        }
        if (!opts.yes && isInteractiveAllowed(program)) {
          const proceed = await promptConfirm({
            message: `Delete webhook ${webhookId}?`,
            initialValue: false,
            cancelMessage: "Cancelled webhook deletion.",
          });
          if (proceed === null) return;
          if (!proceed) {
            console.log(`  ${dim("Skipped webhook deletion.")}`);
            return;
          }
        }

        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Deleting webhook…", "Webhook deleted", () =>
          callNotify(token, "/delete-webhook", {
            method: "DELETE",
            query: { webhook_id: webhookId },
          }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("addresses <webhookId>")
    .description("Get address activity webhook addresses")
    .action(async (webhookId: string) => {
      try {
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Fetching webhook addresses…", "Webhook addresses fetched", () =>
          callNotify(token, "/webhook-addresses", { query: { webhook_id: webhookId } }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("nft-filters <webhookId>")
    .description("Get NFT activity webhook filters")
    .action(async (webhookId: string) => {
      try {
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Fetching NFT filters…", "NFT filters fetched", () =>
          callNotify(token, "/webhook-nft-filters", { query: { webhook_id: webhookId } }),
        );
        if (isJSONMode()) printJSON(result);
        else printSyntaxJSON(result);
      } catch (err) {
        exitWithError(err);
      }
    });
}
