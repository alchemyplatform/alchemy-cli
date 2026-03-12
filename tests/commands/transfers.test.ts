import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

const ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("transfers command", () => {
  it("builds filter payload and calls alchemy_getAssetTransfers", async () => {
    const { printJSON, exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const call = vi.fn().mockResolvedValue({ transfers: [{ hash: "0x1" }] });
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerTransfers } = await import("../../src/commands/transfers.js");
    await runRegisteredCommand(registerTransfers, [
      "transfers",
      ADDRESS,
      "--category",
      "erc20,erc721",
      "--max-count",
      "10",
    ]);

    expect(call).toHaveBeenCalledWith("alchemy_getAssetTransfers", [
      expect.objectContaining({
        fromAddress: ADDRESS,
        toAddress: ADDRESS,
        category: ["erc20", "erc721"],
        maxCount: "0xa",
      }),
    ]);
    expect(printJSON).toHaveBeenCalledWith({ transfers: [{ hash: "0x1" }] });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes address validation failures through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: true });
    const call = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerTransfers } = await import("../../src/commands/transfers.js");
    await runRegisteredCommand(registerTransfers, ["transfers", "not-an-address"]);

    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
