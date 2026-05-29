import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";
import { toolTitle } from "./tools/titles.js";
import {
  resourceReadDuration,
  resourceReadsTotal,
  toolCallDuration,
  toolCallsTotal,
} from "./metrics.js";

/**
 * Wraps a tool handler with Prometheus metrics instrumentation.
 * Tracks call count (success/error/exception) and duration per tool.
 */
function instrumentHandler<T extends (...args: any[]) => any>(
  toolName: string,
  handler: T,
): T {
  return (async (...args: any[]) => {
    const start = process.hrtime.bigint();
    try {
      const result = await handler(...args);
      const status = result?.isError ? "error" : "success";
      toolCallsTotal.inc({ tool: toolName, status });
      toolCallDuration.observe(
        { tool: toolName },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
      return result;
    } catch (err) {
      toolCallsTotal.inc({ tool: toolName, status: "exception" });
      toolCallDuration.observe(
        { tool: toolName },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
      throw err;
    }
  }) as T;
}

function instrumentResourceReadHandler<T extends (...args: any[]) => any>(
  resourceName: string,
  handler: T,
): T {
  return (async (...args: any[]) => {
    const start = process.hrtime.bigint();
    try {
      const result = await handler(...args);
      resourceReadsTotal.inc({ resource: resourceName, status: "success" });
      resourceReadDuration.observe(
        { resource: resourceName },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
      return result;
    } catch (err) {
      resourceReadsTotal.inc({ resource: resourceName, status: "exception" });
      resourceReadDuration.observe(
        { resource: resourceName },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
      throw err;
    }
  }) as T;
}

/**
 * Wrapper around McpServer that instruments MCP primitive handlers with metrics.
 * Registration files call instrumented methods exactly like McpServer methods.
 */
export function createInstrumentedServer(server: McpServer) {
  return {
    tool: (...args: Parameters<typeof server.tool>) => {
      const toolName = args[0] as string;
      const handlerIdx = args.length - 1;
      const original = args[handlerIdx] as (...a: any[]) => Promise<any>;
      args[handlerIdx] = instrumentHandler(toolName, original) as any;

      // The Claude Connectors Directory requires every tool to expose a
      // human-readable `title` alongside its read/destructive hints. Inject it
      // centrally so each registration only declares behavioral hints.
      const annotationsIdx = handlerIdx - 1;
      const annotations = args[annotationsIdx];
      if (isToolAnnotations(annotations) && typeof annotations.title !== "string") {
        args[annotationsIdx] = { ...annotations, title: toolTitle(toolName) } as any;
      }

      return (server.tool as any)(...args);
    },
    registerResource: ((...args: any[]) => {
      const resourceName = args[0] as string;
      const handlerIdx = args.length - 1;
      const original = args[handlerIdx] as (...a: any[]) => any;
      args[handlerIdx] = instrumentResourceReadHandler(resourceName, original);
      return (server.registerResource as any)(...args);
    }) as McpServer["registerResource"],
  };
}

const ANNOTATION_HINT_KEYS = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
  "title",
] as const;

/**
 * Heuristic to identify a `ToolAnnotations` argument among `server.tool` args.
 * Annotations always carry at least one behavioral hint (or a title), which a
 * Zod parameter shape never does — so this won't misfire on the schema arg.
 */
function isToolAnnotations(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return ANNOTATION_HINT_KEYS.some((key) => key in value);
}

export type InstrumentedServer = ReturnType<typeof createInstrumentedServer>;

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "alchemy-mcp-server",
      version: "0.3.7",
    },
    {
      instructions:
        "Alchemy MCP server — interact with 70+ blockchain networks. " +
        "Tools are grouped into three categories: " +
        "Admin (list_apps, select_app, etc.) for managing your Alchemy account and apps; " +
        "EVM tools (getBalance, getNFTsForOwner, traceCall, etc.) for Ethereum, Base, Polygon, Arbitrum, Optimism, and 60+ EVM chains; " +
        "Solana tools (solana_*) for Solana RPC calls and Digital Asset Standard (DAS) methods. " +
        "Network resources are available at alchemy://networks, alchemy://networks/evm, alchemy://networks/solana, and alchemy://networks/{networkId}. " +
        "Start by calling list_apps then select_app to cache an API key before using any tool.",
      capabilities: {
        logging: {},
      },
    },
  );

  const instrumented = createInstrumentedServer(server);
  registerAllTools(instrumented);
  registerAllResources(instrumented);

  return server;
}
