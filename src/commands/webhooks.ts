import { Command } from "commander";
import { exitWithError } from "../lib/errors.js";
import { callNotify } from "../lib/rest.js";
import { withSpinner, printSyntaxJSON } from "../lib/ui.js";
import { isJSONMode, printJSON } from "../lib/output.js";
import { parseRequiredJSON } from "../lib/params.js";
import { load as loadConfig } from "../lib/config.js";

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
  const cmd = program
    .command("webhooks")
    .description("Notify API wrappers")
    .addHelpText(
      "after",
      `
Examples:
  alchemy webhooks list
  alchemy webhooks create --body '{"network":"ETH_MAINNET","webhook_type":"ADDRESS_ACTIVITY","webhook_url":"https://..."}'
  alchemy webhooks delete wh_abc123
  alchemy webhooks addresses wh_abc123`,
    );
  cmd
    .option("--webhook-api-key <key>", "Webhook API key")
    .option("--notify-token <token>", "Deprecated alias for webhook API key");

  cmd
    .command("list")
    .description("List team webhooks")
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
    .description("Create webhook")
    .requiredOption("--body <json>", "Create webhook JSON payload")
    .action(async (opts: { body: string }) => {
      try {
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Creating webhook…", "Webhook created", () =>
          callNotify(token, "/create-webhook", {
            method: "POST",
            body: parseRequiredJSON(opts.body, "--body"),
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
    .action(async (opts: { body: string }) => {
      try {
        const token = resolveWebhookApiKey(cmd.opts());
        const result = await withSpinner("Updating webhook…", "Webhook updated", () =>
          callNotify(token, "/update-webhook", {
            method: "PUT",
            body: parseRequiredJSON(opts.body, "--body"),
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
    .action(async (webhookId: string) => {
      try {
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
