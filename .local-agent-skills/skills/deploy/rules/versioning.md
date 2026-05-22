# Versioning

## Version Format

This project uses semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `0.2.0`)

## Current Versions

Check current versions in these locations:

| Environment      | File                                            | Path to Version                       |
| ---------------- | ----------------------------------------------- | ------------------------------------- |
| Package          | `package.json`                                  | `version` field                       |
| Server           | `src/server.ts`                                 | `version` in McpServer constructor    |
| MCP Registry     | `server.json`                                   | `version` field                       |
| Build (CircleCI) | `.circleci/config.yml`                          | `tag:` in `docker_build_and_push` job |
| Staging          | `helm/stg/use1/alchemy-mcp-server/values.yaml`  | `alchemy-mcp-server.workloads[0].tag` |
| Prod US East     | `helm/prod/use1/alchemy-mcp-server/values.yaml` | `alchemy-mcp-server.workloads[0].tag` |

## Version Bump Rules

1. **Every version bump** must update ALL of these files together:
   - `package.json`
   - `src/server.ts`
   - `.circleci/config.yml`

2. **Staging deploys**: Additionally bump:
   - `helm/stg/use1/alchemy-mcp-server/values.yaml`

3. **Production deploys**: Additionally bump:
   - `helm/prod/use1/alchemy-mcp-server/values.yaml`
   - `server.json` — update `version` to match the production version

4. **CircleCI builds**: The CircleCI `docker_build_and_push` job builds and pushes the Docker image with the specified tag on merge to master. The image must be built before it can be deployed to any environment.

## Important Notes

- The CircleCI config comment says "for now this must be manually incremented before updating k8s manifests for deploys"
- Always ensure the Docker image exists before deploying to production
- Staging should always be deployed before production to validate the build
