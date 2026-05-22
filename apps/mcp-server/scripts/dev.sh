#!/usr/bin/env bash
set -euo pipefail

REDIS_CONTAINER="mcp-server-redis"
REDIS_PORT=6379

# Start Redis if not already running
if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
  echo "Redis already running"
else
  echo "Starting Redis..."
  docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true
  docker run -d --name "$REDIS_CONTAINER" -p "${REDIS_PORT}:6379" redis:7
  echo "Redis started on port ${REDIS_PORT}"
fi

# Stop Redis on exit
cleanup() {
  echo ""
  echo "Stopping Redis..."
  docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true
}
trap cleanup EXIT

# Start the MCP server
echo "Starting MCP server..."
pnpm dev
