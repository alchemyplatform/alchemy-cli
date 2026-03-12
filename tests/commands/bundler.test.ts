import { describe, expect, it, vi } from "vitest";
import {
  installBaseCommandMocks,
  runRegisteredCommand,
  useCommandTestReset,
} from "../helpers/command-harness.js";

useCommandTestReset();

describe("bundler command", () => {
  it("calls eth_sendUserOperation with parsed arguments", async () => {
    const { printSyntaxJSON, exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const call = vi.fn().mockResolvedValue({ userOpHash: "0xabc" });
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerBundler } = await import("../../src/commands/bundler.js");
    await runRegisteredCommand(registerBundler, [
      "bundler",
      "send-user-operation",
      "--user-op",
      '{"sender":"0x1"}',
      "--entry-point",
      "0xentry",
    ]);

    expect(call).toHaveBeenCalledWith("eth_sendUserOperation", [{ sender: "0x1" }, "0xentry"]);
    expect(printSyntaxJSON).toHaveBeenCalledWith({ userOpHash: "0xabc" });
    expect(exitWithError).not.toHaveBeenCalled();
  });

  it("routes invalid user-op JSON through exitWithError", async () => {
    const { exitWithError } = installBaseCommandMocks({ jsonMode: false });
    const call = vi.fn();
    vi.doMock("../../src/lib/resolve.js", () => ({
      clientFromFlags: () => ({ call }),
    }));

    const { registerBundler } = await import("../../src/commands/bundler.js");
    await runRegisteredCommand(registerBundler, [
      "bundler",
      "send-user-operation",
      "--user-op",
      "{bad-json",
      "--entry-point",
      "0xentry",
    ]);

    expect(call).not.toHaveBeenCalled();
    expect(exitWithError).toHaveBeenCalledTimes(1);
  });
});
