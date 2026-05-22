import { Counter, Histogram, register, collectDefaultMetrics } from "prom-client";

// Collect Node.js default metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics();

// --- Request metrics ---

export const httpRequestsTotal = new Counter({
  name: "mcp_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status"] as const,
});

export const httpRequestDuration = new Histogram({
  name: "mcp_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "path", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// --- Auth metrics ---

export const authFailuresTotal = new Counter({
  name: "mcp_auth_failures_total",
  help: "Total authentication failures",
  labelNames: ["reason"] as const,
});

export const authSuccessTotal = new Counter({
  name: "mcp_auth_success_total",
  help: "Total successful authentications",
});

// --- Tool call metrics ---

export const toolCallsTotal = new Counter({
  name: "mcp_tool_calls_total",
  help: "Total MCP tool calls",
  labelNames: ["tool", "status"] as const,
});

export const toolCallDuration = new Histogram({
  name: "mcp_tool_call_duration_seconds",
  help: "MCP tool call duration in seconds",
  labelNames: ["tool"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

// --- Resource read metrics ---

export const resourceReadsTotal = new Counter({
  name: "mcp_resource_reads_total",
  help: "Total MCP resource reads",
  labelNames: ["resource", "status"] as const,
});

export const resourceReadDuration = new Histogram({
  name: "mcp_resource_read_duration_seconds",
  help: "MCP resource read duration in seconds",
  labelNames: ["resource"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

// --- Error metrics ---

export const errorsTotal = new Counter({
  name: "mcp_errors_total",
  help: "Total unhandled errors",
  labelNames: ["type"] as const,
});

// Export registry for /metrics endpoint
export { register };
