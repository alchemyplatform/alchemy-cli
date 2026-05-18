# @alchemy/cli

## 0.8.0

### Minor Changes

- [#54](https://github.com/OMGWINNING/alchemy-cli/pull/54) [`f059851`](https://github.com/OMGWINNING/alchemy-cli/commit/f059851352242b3fa3f68533e87801d15b6b940b) Thanks [@lohnim](https://github.com/lohnim)! - Add Gas Manager policy management.

  - New `alchemy gas-manager policy {list,get,create,activate}` for listing, fetching, interactive creation, and activating gas sponsorship policies via the `manage.g.alchemy.com` admin API. Requires `alchemy auth login` (this surface intentionally does not accept access keys — user auth only).
  - When `--gas-sponsored` / `--fee-sponsored` is set without a policy ID, the CLI now prompts the user to select an existing policy or create a new one (sponsorship for EVM, solana for Solana), then optionally saves the selection as default. Non-interactive / not-logged-in cases fall through to a clear error with guidance.
  - `alchemy config set evm-gas-policy-id` and `solana-fee-policy-id` now accept an optional argument: omit it to run the interactive select/create flow.

## 0.7.4

### Patch Changes

- [#52](https://github.com/OMGWINNING/alchemy-cli/pull/52) [`aac9248`](https://github.com/OMGWINNING/alchemy-cli/commit/aac924856e5db44952614e29de3cf8419a8d5097) Thanks [@CodesMcCabe](https://github.com/CodesMcCabe)! - Streamline release workflow by committing version updates directly to main instead of creating intermediate release PRs.

## 0.7.3

### Patch Changes

- [#45](https://github.com/OMGWINNING/alchemy-cli/pull/45) [`dbed1f1`](https://github.com/OMGWINNING/alchemy-cli/commit/dbed1f1398bdb177ebcee4ae1a90a04ce332701e) Thanks [@CodesMcCabe](https://github.com/CodesMcCabe)! - Add a patch release entry to verify the package release pipeline.
