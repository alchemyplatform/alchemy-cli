import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

describe("webhooks command", () => {
  it("lists webhooks with webhook API key", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callNotify = vi.fn().mockResolvedValue({ data: [{ id: "wh_1" }] });
    vi.doMock("../../src/lib/rest.js", () => ({ callNotify }));
    vi.doMock("../../src/lib/config.js", () => ({ load: () => ({}) }));

    const { registerWebhooks } = await import("../../src/commands/webhooks.js");
    await runRegisteredCommand(registerWebhooks, [
      "webhooks",
      "--webhook-api-key",
      "wh_key",
      "list",
    ]);

    expect(callNotify).toHaveBeenCalledWith("wh_key", "/team-webhooks");
    expect(printJSON).toHaveBeenCalledWith({ data: [{ id: "wh_1" }] });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes invalid create body JSON through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callNotify = vi.fn();
    vi.doMock("../../src/lib/rest.js", () => ({ callNotify }));
    vi.doMock("../../src/lib/config.js", () => ({ load: () => ({}) }));

    const { registerWebhooks } = await import("../../src/commands/webhooks.js");
    await runRegisteredCommand(registerWebhooks, [
      "webhooks",
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
