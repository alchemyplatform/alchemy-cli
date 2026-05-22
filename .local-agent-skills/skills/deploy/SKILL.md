---
name: deploy
description: |
  Deploy the alchemy-mcp-server to staging or production environments
triggers:
  - deploy staging
  - deploy to staging
  - deploy prod
  - deploy to prod
  - deploy production
  - deploy to production
  - deploy latest
  - deploy version
  - bump version
---

# Deploy Skill

Handles deployment of the alchemy-mcp-server by bumping version numbers in the appropriate configuration files.

## Use when

- Deploying a new version to staging
- Deploying a version to production (any region: use1, apse1, euc1, usw2)
- Bumping the Docker image version

## Rules

| Rule                                            | Description                                           |
| ----------------------------------------------- | ----------------------------------------------------- |
| [commit-convention](rules/commit-convention.md) | **Always use `chore:` prefix for all deploy commits** |
| [staging](rules/staging.md)                     | How to deploy to staging environment                  |
| [production](rules/production.md)               | How to deploy to production environments              |
| [versioning](rules/versioning.md)               | Version numbering conventions                         |
