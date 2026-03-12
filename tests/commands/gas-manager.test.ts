import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

describe("gas-manager command", () => {
  it("calls alchemy_requestGasAndPaymasterAndData with parsed body", async () => {
    const { printSyntaxJSON, exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const call = vi.fn().mockResolvedValue({ paymasterAndData: "0xabc" });
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerGasManager } = await import("../../src/commands/gas-manager.js");
    await runRegisteredCommand(registerGasManager, [
      "gas-manager",
      "request-gas-and-paymaster",
      "--body",
      '{"sender":"0x1"}',
    ]);

    expect(call).toHaveBeenCalledWith("alchemy_requestGasAndPaymasterAndData", [
      { sender: "0x1" },
    ]);
    expect(printSyntaxJSON).toHaveBeenCalledWith({ paymasterAndData: "0xabc" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes invalid body JSON through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const call = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerGasManager } = await import("../../src/commands/gas-manager.js");
    await runRegisteredCommand(registerGasManager, [
      "gas-manager",
      "request-paymaster-token-quote",
      "--body",
      "{bad-json",
    ]);

    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
