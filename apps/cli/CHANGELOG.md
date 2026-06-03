# @alchemy/cli

## 0.14.0

### Minor Changes

- [#77](https://github.com/OMGWINNING/alchemy-cli/pull/77) [`d7016ce`](https://github.com/OMGWINNING/alchemy-cli/commit/d7016cec1a468a9ed41bd4a96d09f2505b8c68e6) Thanks [@blakecduncan](https://github.com/blakecduncan)! - Add scoped agent prompts, transaction preflight guidance, delegated wallet call capabilities, and structured EVM preflight revert errors.

## 0.13.0

### Minor Changes

- [#76](https://github.com/OMGWINNING/alchemy-cli/pull/76) [`36d1923`](https://github.com/OMGWINNING/alchemy-cli/commit/36d1923eac7be047415e8a741f79020055387008) Thanks [@blakecduncan](https://github.com/blakecduncan)! - Compact app list JSON output by default, add a full sanitized app payload mode, and send app network updates with the Admin API's `networkAllowlist` field.

## 0.12.0

### Minor Changes

- [#56](https://github.com/OMGWINNING/alchemy-cli/pull/56) [`c25a2b0`](https://github.com/OMGWINNING/alchemy-cli/commit/c25a2b02b37063e42db145ebc6ca0186bb7eecb3) Thanks [@blakecduncan](https://github.com/blakecduncan)! - Default `alchemy wallet connect` to session wallets and require explicit `--mode local` when users need to create or import local wallet keys.

  Scripts that previously used `alchemy wallet connect --import <path>` should now use `alchemy wallet connect --mode local --import <path>`.

## 0.11.1

### Patch Changes

- [#71](https://github.com/OMGWINNING/alchemy-cli/pull/71) [`7b55266`](https://github.com/OMGWINNING/alchemy-cli/commit/7b55266d776b1e70d132c20e6ab221e43ae21260) Thanks [@lohnim](https://github.com/lohnim)! - Mask webhook HMAC signing keys and app RPC URLs in CLI JSON output, treat a single JSON array passed to `alchemy evm rpc` as the full JSON-RPC params array, and preserve NETWORK_ERROR classification for SDK-wrapped fetch failures.

## 0.11.0

### Minor Changes

- [#69](https://github.com/OMGWINNING/alchemy-cli/pull/69) [`784315f`](https://github.com/OMGWINNING/alchemy-cli/commit/784315fa645882f8906470544fd5bb9468e89810) Thanks [@lohnim](https://github.com/lohnim)! - Use the browser login auth token for Admin API app operations, removing deprecated legacy admin auth guidance from the CLI.

  Route wallet-operation helper RPC calls through explicit API-key client construction, so wallet sends do not depend on x402 configuration, and point missing EVM wallets at `alchemy wallet connect`.

  Require `-n/--network` for networked CLI commands instead of using hidden `eth-mainnet` or `solana-mainnet` defaults, and remove the persisted `config set network` surface.

## 0.10.0

### Minor Changes

- [#65](https://github.com/OMGWINNING/alchemy-cli/pull/65) [`5b72ff2`](https://github.com/OMGWINNING/alchemy-cli/commit/5b72ff2d5c807e84736e5d4e993aae06140a20db) Thanks [@blakecduncan](https://github.com/blakecduncan)! - Add support for sending Solana SPL tokens, including dry-run previews and controls for recipient associated token account handling.

## 0.9.3

### Patch Changes

- [#67](https://github.com/OMGWINNING/alchemy-cli/pull/67) [`6eee5f9`](https://github.com/OMGWINNING/alchemy-cli/commit/6eee5f9dc29ddd83da3b8b1e876f41373a301339) Thanks [@lohnim](https://github.com/lohnim)! - Add Monad mainnet and testnet support for EVM wallet operations, and display MON as the native token symbol for Monad networks.

## 0.9.2

### Patch Changes

- [#46](https://github.com/OMGWINNING/alchemy-cli/pull/46) [`065357f`](https://github.com/OMGWINNING/alchemy-cli/commit/065357f0bff91a9b039642c92d3f150051d3c055) Thanks [@lohnim](https://github.com/lohnim)! - Add `alchemy evm token <SYMBOL>` and `alchemy evm token list` for resolving common token addresses (ETH, USDC, WETH, USDT, DAI, …) per chain from a curated registry. `--address-only` prints just the 0x address for easy shell composition: `--from $(alchemy evm token ETH --address-only)`.

## 0.9.1

### Patch Changes

- [#57](https://github.com/OMGWINNING/alchemy-cli/pull/57) [`341c7d5`](https://github.com/OMGWINNING/alchemy-cli/commit/341c7d57d147624756db7b3ada24ca0a4ff9fb7d) Thanks [@lohnim](https://github.com/lohnim)! - Fix `app create` failing with HTTP 400. The CLI was sending `chainNetworks` in the POST body, but the Admin API expects `networkAllowlist`.

## 0.9.0

### Minor Changes

- [#55](https://github.com/OMGWINNING/alchemy-cli/pull/55) [`f7e477e`](https://github.com/OMGWINNING/alchemy-cli/commit/f7e477ef49e31753267723a5bebc543571a94fdd) Thanks [@blakecduncan](https://github.com/blakecduncan)! - Add unified EVM and Solana wallet connection flows, including multichain session approvals and Solana session signing support.

## 0.8.0

### Minor Changes

- [#54](https://github.com/OMGWINNING/alchemy-cli/pull/54) [`f059851`](https://github.com/OMGWINNING/alchemy-cli/commit/f059851352242b3fa3f68533e87801d15b6b940b) Thanks [@lohnim](https://github.com/lohnim)! - Add Gas Manager policy management.

  - New `alchemy gas-manager policy {list,get,create,activate}` for listing, fetching, interactive creation, and activating gas sponsorship policies via the `manage.g.alchemy.com` admin API. Requires `alchemy auth login`.
  - When `--gas-sponsored` / `--fee-sponsored` is set without a policy ID, the CLI now prompts the user to select an existing policy or create a new one (sponsorship for EVM, solana for Solana), then optionally saves the selection as default. Non-interactive / not-logged-in cases fall through to a clear error with guidance.
  - `alchemy config set evm-gas-policy-id` and `solana-fee-policy-id` now accept an optional argument: omit it to run the interactive select/create flow.

## 0.7.4

### Patch Changes

- [#52](https://github.com/OMGWINNING/alchemy-cli/pull/52) [`aac9248`](https://github.com/OMGWINNING/alchemy-cli/commit/aac924856e5db44952614e29de3cf8419a8d5097) Thanks [@CodesMcCabe](https://github.com/CodesMcCabe)! - Streamline release workflow by committing version updates directly to main instead of creating intermediate release PRs.

## 0.7.3

### Patch Changes

- [#45](https://github.com/OMGWINNING/alchemy-cli/pull/45) [`dbed1f1`](https://github.com/OMGWINNING/alchemy-cli/commit/dbed1f1398bdb177ebcee4ae1a90a04ce332701e) Thanks [@CodesMcCabe](https://github.com/CodesMcCabe)! - Add a patch release entry to verify the package release pipeline.
