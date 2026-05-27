import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

describe("webhook command", () => {
  it("lists webhooks with webhook API key", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callNotify = vi.fn().mockResolvedValue({ data: [{ id: "wh_1" }] });
    vi.doMock("../../src/lib/rest.js", () => ({ callNotify }));
    vi.doMock("../../src/lib/config.js", () => ({ load: () => ({}) }));

    const { registerWebhooks } = await import("../../src/commands/webhooks.js");
    await runRegisteredCommand(registerWebhooks, [
      "webhook",
      "--webhook-api-key",
      "wh_key",
      "list",
    ]);

    expect(callNotify).toHaveBeenCalledWith("wh_key", "/team-webhooks");
    expect(printJSON).toHaveBeenCalledWith({ data: [{ id: "wh_1" }] });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("masks webhook HMAC signing keys in list output", async () => {
    const { printJSON } = installBaseCommandMocks({ jsonMode: true });
    const callNotify = vi.fn().mockResolvedValue({
      data: [
        {
          id: "wh_1",
          hmacSigningKey: "whsec_1234567890abcdef",
          nested: { signing_secret: "nested-signing-secret" },
        },
      ],
    });
    vi.doMock("../../src/lib/rest.js", () => ({ callNotify }));
    vi.doMock("../../src/lib/config.js", () => ({ load: () => ({}) }));

    const { registerWebhooks } = await import("../../src/commands/webhooks.js");
    await runRegisteredCommand(registerWebhooks, [
      "webhook",
      "--webhook-api-key",
      "wh_key",
      "list",
    ]);

    const payload = printJSON.mock.calls[0][0] as {
      data: Array<{ hmacSigningKey: string; nested: { signing_secret: string } }>;
    };
    expect(JSON.stringify(payload)).not.toContain("whsec_1234567890abcdef");
    expect(JSON.stringify(payload)).not.toContain("nested-signing-secret");
    expect(payload.data[0].hmacSigningKey).toMatch(/^whse.+cdef$/);
    expect(payload.data[0].hmacSigningKey).toContain("•");
    expect(payload.data[0].nested.signing_secret).toMatch(/^nest.+cret$/);
    expect(payload.data[0].nested.signing_secret).toContain("•");
  });

  it("routes invalid create body JSON through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callNotify = vi.fn();
    vi.doMock("../../src/lib/rest.js", () => ({ callNotify }));
    vi.doMock("../../src/lib/config.js", () => ({ load: () => ({}) }));

    const { registerWebhooks } = await import("../../src/commands/webhooks.js");
    await runRegisteredCommand(registerWebhooks, [
      "webhook",
      "--webhook-api-key",
      "wh_key",
      "create",
      "--body",
      "{bad-json",
    ]);

    expect(callNotify).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
