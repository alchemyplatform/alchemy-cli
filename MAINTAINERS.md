# Maintainers Guide

Maintainer-focused operational docs for release management and advanced local testing.
For general usage and contributor setup, see `README.md`.

## Local Development

Prerequisites:

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Setup

```bash
git clone https://github.com/alchemyplatform/alchemy-cli.git
cd alchemy-cli
pnpm install
pnpm build
pnpm link --global
```

This makes the local `alchemy` build available globally for testing.
To unlink later: `pnpm unlink --global`.

### Common Commands

Run during development:

```bash
# Run without building
npx tsx src/index.ts balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Build in watch mode
pnpm dev
```

Build:

```bash
pnpm build
```

Test:

```bash
pnpm test
pnpm test:e2e
```

Type check:

```bash
pnpm lint
```

Coverage:

```bash
pnpm test:coverage
```

## Changesets And Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and release notes.

**When to add a changeset:** Any PR with user-facing changes (new commands, bug fixes, flag changes, output format changes) needs a changeset. Internal changes (CI, refactors with no behavior change, docs) can skip by adding the `no-changeset` label.

**How to add a changeset:**

```bash
pnpm changeset
```

You will be prompted to pick the bump type:
- **patch** - bug fixes, small tweaks (for example fixing `--json` output for a command)
- **minor** - new commands, new flags, new capabilities
- **major** - breaking changes (removed commands, changed flag behavior, output format changes)

This creates a file like `.changeset/cool-dogs-fly.md`:

```markdown
---
"@alchemy/cli": minor
---

Add `alchemy portfolio transactions` command for portfolio transaction history.
```

Write a 1-2 sentence summary of the change from a user's perspective. Commit this file with your PR.

**How releases work:** When PRs with changesets merge to `main`, the publish workflow automatically:
1. Verifies the build (typecheck, build, test)
2. Applies version bumps and updates `CHANGELOG.md` via `changeset version`
3. Creates a signed release commit via the GitHub Git Database API (using a GitHub App token)
4. Publishes to npm using OIDC trusted publishing (no long-lived npm token)
5. Creates a GitHub release/tag with notes extracted from `CHANGELOG.md`

If no changesets are pending, the workflow exits cleanly and no release is created.

**Release infrastructure:**
- Repository write operations use a GitHub App (`APP_ID` variable + `APP_PRIVATE_KEY` secret)
- npm publish uses [trusted publishing](https://docs.npmjs.com/generating-provenance-statements) (OIDC), so no `NPM_TOKEN` secret is required
- Required GitHub repo settings: `APP_ID` (variable), `APP_PRIVATE_KEY` (secret)
- Required npm-side: configure trusted publishing for this repo/workflow at npm package settings

## Endpoint Override Env Vars (Local Testing Only)

These are for local/mock testing, not normal production usage:

- `ALCHEMY_RPC_BASE_URL`
- `ALCHEMY_ADMIN_API_BASE_URL`
- `ALCHEMY_X402_BASE_URL`

Safety constraints:

- Only localhost targets are accepted (`localhost`, `127.0.0.1`, `::1`)
- Non-HTTPS transport is allowed only for localhost
- Production defaults are unchanged when unset
