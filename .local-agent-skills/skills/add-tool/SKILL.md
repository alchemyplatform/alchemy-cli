---
name: add-tool
description: |
  Add new API tools to the MCP server. Ensures every tool has a proper Zod schema, dedicated handler, and follows existing patterns.
triggers:
  - add tool
  - add tools
  - new tool
  - new tools
  - add rpc
  - add api
  - add endpoint
  - add method
  - implement tool
---

# Add Tool Skill

Guides the creation of new MCP tools for the alchemy-mcp-server. Every Alchemy API must have a dedicated tool with a proper Zod schema — no relying on the generic `rpc_call` for documented methods.

## Use when

- Adding a new Alchemy API method as a tool
- Adding support for a new chain's RPC methods
- Implementing tools for newly documented Alchemy endpoints
- Reviewing whether all documented APIs have dedicated tools

## Rules

| Rule                                      | Description                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| [tool-structure](rules/tool-structure.md) | Every tool must have a Zod schema, dedicated handler, and proper descriptions |
| [api-coverage](rules/api-coverage.md)     | All documented Alchemy APIs must have 1:1 dedicated tools                     |
| [naming](rules/naming.md)                 | Tool naming conventions                                                       |
| [testing](rules/testing.md)               | How to verify tools work                                                      |
