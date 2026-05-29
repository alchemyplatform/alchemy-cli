import { describe, expect, it } from "vitest";
import { createInstrumentedServer } from "../src/server.js";
import { registerAllTools } from "../src/tools/index.js";
import { humanizeToolName, toolTitle } from "../src/tools/titles.js";

interface CapturedTool {
  name: string;
  annotations: Record<string, unknown> | undefined;
}

function captureRegisteredTools(): CapturedTool[] {
  const captured: CapturedTool[] = [];
  const base = {
    tool: (...args: unknown[]) => {
      // args === [name, description, paramsSchema, annotations, handler]
      captured.push({
        name: args[0] as string,
        annotations: args[args.length - 2] as Record<string, unknown> | undefined,
      });
    },
    registerResource: () => {},
  };

  const instrumented = createInstrumentedServer(base as never);
  registerAllTools(instrumented);
  return captured;
}

describe("tool annotations (Claude Connectors Directory compliance)", () => {
  const tools = captureRegisteredTools();

  it("registers the full tool surface", () => {
    expect(tools.length).toBeGreaterThan(100);
  });

  it("every tool exposes a non-empty title", () => {
    for (const { name, annotations } of tools) {
      expect(annotations, `${name} has no annotations object`).toBeTypeOf("object");
      const title = annotations?.title;
      expect(typeof title, `${name} is missing a title annotation`).toBe("string");
      expect((title as string).length, `${name} has an empty title`).toBeGreaterThan(0);
    }
  });

  it("every tool declares a readOnlyHint or destructiveHint", () => {
    for (const { name, annotations } of tools) {
      const hasHint =
        typeof annotations?.readOnlyHint === "boolean" ||
        typeof annotations?.destructiveHint === "boolean";
      expect(hasHint, `${name} is missing readOnlyHint/destructiveHint`).toBe(true);
    }
  });

  it("does not overwrite an explicitly provided title", () => {
    const captured: CapturedTool[] = [];
    const base = {
      tool: (...args: unknown[]) => {
        captured.push({
          name: args[0] as string,
          annotations: args[args.length - 2] as Record<string, unknown>,
        });
      },
      registerResource: () => {},
    };
    const instrumented = createInstrumentedServer(base as never);
    instrumented.tool(
      "custom_tool",
      "desc",
      {},
      { readOnlyHint: true, title: "Explicit Title" } as never,
      (async () => ({ content: [] })) as never,
    );
    expect(captured[0]?.annotations?.title).toBe("Explicit Title");
  });
});

describe("humanizeToolName", () => {
  it.each([
    ["ethGetBalance", "ETH Get Balance"],
    ["getNFTsForOwner", "Get NFTs For Owner"],
    ["getNFTMetadata", "Get NFT Metadata"],
    ["solana_getAssetsByOwner", "Solana Get Assets By Owner"],
    ["debugTraceBlockByNumber", "Debug Trace Block By Number"],
    ["rundlerMaxPriorityFeePerGas", "Rundler Max Priority Fee Per Gas"],
    ["list_apps", "List Apps"],
    ["update_allowlist", "Update Allowlist"],
  ])("humanizes %s -> %s", (input, expected) => {
    expect(humanizeToolName(input)).toBe(expected);
  });

  it("applies overrides", () => {
    expect(toolTitle("ping")).toBe("Ping");
  });
});
