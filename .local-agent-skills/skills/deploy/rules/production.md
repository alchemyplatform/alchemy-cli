# Production Deployment

## Overview

Production deployments update the version tag in the appropriate region's `tags.yaml` file.

## Regions

| Region Code | Location       | File Path                   |
| ----------- | -------------- | --------------------------- |
| `use1`      | US East 1      | `helm/prod/use1/tags.yaml`  |
| `usw2`      | US West 2      | `helm/prod/usw2/tags.yaml`  |
| `apse1`     | AP Southeast 1 | `helm/prod/apse1/tags.yaml` |
| `euc1`      | EU Central 1   | `helm/prod/euc1/tags.yaml`  |

## Steps

1. **Determine the version to deploy**:
   - Usually the latest staging version (from `helm/stg/use1/alchemy-mcp-server/values.yaml`)
   - Or a specific version if the user specifies one
   - The Docker image MUST already exist in ECR (built by CircleCI on merge to master)

2. **Update prod values**:
   - `helm/prod/use1/alchemy-mcp-server/values.yaml` — update `tag:` under workloads
   - `server.json` — update `version` field to match the deployed version (this is the public MCP registry version)

3. **Commit and push**. Commit message **must** use the `chore:` prefix (see [commit-convention](commit-convention.md)):
   ```
   chore: deploy version X.Y.Z to prod
   ```

## Example

When user says "deploy latest to prod":

```yaml
# helm/prod/use1/alchemy-mcp-server/values.yaml
alchemy-mcp-server:
  workloads:
    - name: alchemy-mcp-server-mcp
      tag: 0.2.0 # Updated from staging version
```

```json
// server.json
"version": "0.2.0"
```
