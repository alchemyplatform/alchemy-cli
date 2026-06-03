import { describe, expect, it } from "vitest";
import {
  classifySolanaDasPaywallError,
  isSolanaDasMethod,
  solanaRpcFamilyForMethod,
} from "../src/solana/index.js";

describe("SDK Solana helpers", () => {
  it("classifies DAS methods separately from standard Solana RPC", () => {
    expect(isSolanaDasMethod("getAssetsByOwner")).toBe(true);
    expect(solanaRpcFamilyForMethod("getAssetsByOwner")).toBe("das");
    expect(isSolanaDasMethod("getBalance")).toBe(false);
    expect(solanaRpcFamilyForMethod("getBalance")).toBe("rpc");
  });

  it("classifies paid-plan DAS failures", () => {
    const err = new Error("Your current plan does not support this method. Upgrade to PAYG.");

    expect(classifySolanaDasPaywallError(err)).toEqual({
      message: "Solana DAS request requires a paid Alchemy plan.",
      hint: "Upgrade your app to PAYG or use a plan with Solana DAS access at https://dashboard.alchemy.com/.",
      details: "Your current plan does not support this method. Upgrade to PAYG.",
    });
    expect(classifySolanaDasPaywallError(new Error("method not found"))).toBeUndefined();
  });
});
