# Commit Convention

## REQUIRED: Always use `chore:` prefix

All commits made when using the deploy skill **must** use the `chore:` conventional commit prefix. This is non-negotiable.

## Format

```
chore: <description>
```

## Examples

```
chore: bump version to 0.2.0 for staging deploy
chore: deploy version 0.2.0 to prod-apse1
chore: deploy version 0.2.0 to prod-use1, prod-apse1
```

## Never use other prefixes

Do **not** use `feat:`, `fix:`, `build:`, or any other prefix for deployment commits.
