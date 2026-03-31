import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

describe("portfolio command", () => {
  it("calls data API for portfolio tokens", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callApiData = vi.fn().mockResolvedValue({ items: [{ symbol: "ETH" }] });
    vi.doMock("../../src/lib/rest.js", () => ({ callApiData }));
    vi.doMock("../../src/lib/resolve.js", () => ({ resolveAPIKey: () => "api_key", resolveX402Client: () => null }));

    const { registerPortfolio } = await import("../../src/commands/portfolio.js");
    await runRegisteredCommand(registerPortfolio, [
      "portfolio",
      "tokens",
      "--body",
      '{"addresses":[{"network":"eth-mainnet","address":"0xabc"}]}',
    ]);

    expect(callApiData).toHaveBeenCalledWith(
      "api_key",
      "/assets/tokens/by-address",
      expect.objectContaining({
        method: "POST",
        body: expect.any(Object),
      }),
    );
    expect(printJSON).toHaveBeenCalledWith({ items: [{ symbol: "ETH" }] });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes invalid JSON body errors to exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const callApiData = vi.fn();
    vi.doMock("../../src/lib/rest.js", () => ({ callApiData }));
    vi.doMock("../../src/lib/resolve.js", () => ({ resolveAPIKey: () => "api_key", resolveX402Client: () => null }));

    const { registerPortfolio } = await import("../../src/commands/portfolio.js");
    await runRegisteredCommand(registerPortfolio, [
      "portfolio",
      "tokens",
      "--body",
      "{bad-json",
    ]);

    expect(callApiData).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
