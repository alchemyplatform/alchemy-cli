# Staging Deployment

## Overview

Staging deployments require updating the version in **two** files:

1. `.circleci/config.yml` - The Docker image build tag
2. `helm/stg/use1/alchemy-mcp-server/values.yaml` - The staging deployment tag

## Steps

1. **Determine the new version**: Increment the patch version (e.g., `0.1.4` -> `0.1.5`)

2. **Update ALL version files** (see [versioning](versioning.md)):
   - `package.json` — `version` field
   - `src/server.ts` — `version` in McpServer constructor
   - `.circleci/config.yml` — `tag:` in `docker_build_and_push` job
   - `helm/stg/use1/alchemy-mcp-server/values.yaml` — `tag:` under workloads

3. **Commit and push** the changes. Commit message **must** use the `chore:` prefix (see [commit-convention](commit-convention.md)):
   ```
   chore: bump version to X.Y.Z
   ```

## Example

When user says "deploy staging" or "deploy to staging":

```yaml
# .circleci/config.yml
tag: 0.2.0  # Was 0.1.0

# helm/stg/use1/alchemy-mcp-server/values.yaml
tag: 0.2.0  # Was 0.1.0
```

```json
// package.json
"version": "0.2.0"
```

```typescript
// src/server.ts
version: "0.2.0";
```
