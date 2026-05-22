import { describe, expect, it } from "vitest";
import { registerAllResources } from "../src/resources/index.js";
import { registerAllTools } from "../src/tools/index.js";

describe("MCP registration", () => {
  it("registers the expected tool surface", () => {
    const tools: string[] = [];
    const server = {
      tool(name: string) {
        tools.push(name);
      },
    };

    registerAllTools(server as never);

    expect(tools).toContain("ping");
    expect(tools).toContain("list_apps");
    expect(tools).toContain("select_app");
    expect(tools).toContain("ethGetBalance");
    expect(tools).toContain("getNFTsForOwner");
    expect(tools).toContain("getTokenBalances");
    expect(tools.length).toBeGreaterThan(100);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it("registers network resources", () => {
    const resources: string[] = [];
    const server = {
      registerResource(name: string) {
        resources.push(name);
      },
    };

    registerAllResources(server as never);

    expect(resources).toEqual([
      "networks",
      "evm-networks",
      "solana-networks",
      "network",
    ]);
  });
});
