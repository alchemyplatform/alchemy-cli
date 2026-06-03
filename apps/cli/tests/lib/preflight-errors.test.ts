import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/lib/errors.js";
import {
  normalizePreflightRevertError,
  withPreflightRevert,
} from "../../src/lib/preflight-errors.js";

describe("preflight error normalization", () => {
  it("extracts revert reasons from execution errors", () => {
    const err = normalizePreflightRevertError(
      new Error("execution reverted: ERC20: transfer amount exceeds allowance"),
    );

    expect(err).toMatchObject({
      code: ErrorCode.PREFLIGHT_REVERT,
      message: "Transaction preflight reverted: ERC20: transfer amount exceeds allowance",
      data: { reason: "ERC20: transfer amount exceeds allowance" },
    });
  });

  it("extracts production user-operation preflight reasons", () => {
    const err = normalizePreflightRevertError(
      new Error("RPC Request failed.\n\nDetails: An error occurred while executing user operation: ERC20: transfer amount exceeds balance\nVersion: viem@2.47.10"),
    );

    expect(err).toMatchObject({
      code: ErrorCode.PREFLIGHT_REVERT,
      message: "Transaction preflight reverted: ERC20: transfer amount exceeds balance",
      data: { reason: "ERC20: transfer amount exceeds balance" },
    });
  });

  it("extracts viem multiline revert reasons", () => {
    const err = normalizePreflightRevertError(
      new Error("The contract function reverted with the following reason:\nERC20: transfer amount exceeds allowance"),
    );

    expect(err).toMatchObject({
      code: ErrorCode.PREFLIGHT_REVERT,
      message: "Transaction preflight reverted: ERC20: transfer amount exceeds allowance",
      data: { reason: "ERC20: transfer amount exceeds allowance" },
    });
  });

  it("does not treat following diagnostic lines as a bare revert reason", () => {
    const err = normalizePreflightRevertError(
      new Error("Details: An error occurred while executing user operation: execution reverted\nVersion: viem@2.47.10"),
    );

    expect(err).toMatchObject({
      code: ErrorCode.PREFLIGHT_REVERT,
      message: "Transaction preflight reverted: execution reverted",
      data: { reason: "execution reverted" },
    });
  });

  it("wraps rejected preflight calls", async () => {
    await expect(
      withPreflightRevert(async () => {
        throw new Error("VM Exception while processing transaction: reverted with reason string 'InsufficientBalance'");
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.PREFLIGHT_REVERT,
      data: { reason: "InsufficientBalance" },
    });
  });
});
