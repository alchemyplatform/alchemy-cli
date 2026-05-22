# Alchemy Developer Tools

This monorepo contains Alchemy's agent-facing developer tools.

## Packages

- `apps/cli` - published npm package `@alchemy/cli`
- `apps/mcp-server` - hosted Alchemy MCP server
- `helm` - deployment charts for the hosted MCP server
- `docs` - architecture and service documentation

## Development

Install dependencies from the repository root:

```bash
pnpm install
```

Common commands:

```bash
pnpm build
pnpm lint
pnpm test
pnpm --filter @alchemy/cli test:e2e
pnpm mcp:docker:build
```

The MCP server keeps the deployed service, Helm chart, and ECR image identity as
`alchemy-mcp-server`.
