# Live Test Setup

These tests hit real chains and are intentionally separate from the default fast test suite.
They are for manual local verification only and should not run in CI/CD.

Use a local `.env.local` in the repo root for these values.

Start from `.env.live.example` and copy the values you need into `.env.local`.

## Commands

```bash
pnpm live:check
pnpm test:live
```

The package scripts automatically load `.env.local` when it exists, so you do not need to manually `source` the file first.

`pnpm live:check` prints the derived wallet addresses, current balances, recipients, configured EVM test contract details, and whether sponsored flows are configured, then exits non-zero if the funded wallets are below the configured thresholds.

## Required Environment Variables

- `ALCHEMY_LIVE_API_KEY`
- `ALCHEMY_LIVE_EVM_PRIVATE_KEY`
- `ALCHEMY_LIVE_EVM_RECIPIENT`
- `ALCHEMY_LIVE_EVM_CONTRACT_ADDRESS`
- `ALCHEMY_LIVE_SOLANA_PRIVATE_KEY`
- `ALCHEMY_LIVE_SOLANA_RECIPIENT`

## Optional Environment Variables

- `ALCHEMY_LIVE_NETWORK` default: `eth-sepolia`
- `ALCHEMY_LIVE_SOLANA_NETWORK` default: `solana-devnet`
- `ALCHEMY_LIVE_EVM_GAS_POLICY_ID` enables optional sponsored EVM tests
- `ALCHEMY_LIVE_SOLANA_GAS_POLICY_ID` enables optional sponsored Solana tests
- `ALCHEMY_LIVE_MIN_EVM_WEI` default: `10000000000000000`
- `ALCHEMY_LIVE_MIN_SOL_LAMPORTS` default: `20000000`
- `ALCHEMY_LIVE_EVM_SEND_AMOUNT` default: `0.000001`
- `ALCHEMY_LIVE_EVM_DEPOSIT_AMOUNT` default: `0.000001`
- `ALCHEMY_LIVE_SOLANA_SEND_AMOUNT` default: `0.001`

## Expected EVM Test Contract

The configured Sepolia contract is expected to support these signatures:

- `name()(string)`
- `approve(address,uint256)(bool)`
- `allowance(address,address)(uint256)`
- `deposit()`

A public Sepolia WETH contract works well here because it supports all of those methods. The live contract tests use `approve(address,uint256)` with `ALCHEMY_LIVE_EVM_RECIPIENT` as the spender, then verify the allowance with `allowance(address,address)`.

## Sponsored Flows

Sponsored tests are optional and only run when the matching gas policy env var is set:

- `ALCHEMY_LIVE_EVM_GAS_POLICY_ID` for EVM `send` and `contract call`
- `ALCHEMY_LIVE_SOLANA_GAS_POLICY_ID` for Solana `send`

If those variables are omitted, the non-sponsored tests still run and the sponsored cases are skipped.

## Extending The Suite

When new CLI functionality needs real-chain coverage:

1. Add any new env inputs to `tests/live/helpers/live-env.ts`.
2. Reuse `requireLiveConfig()` and the `runLive*CLI()` helpers from `tests/live/helpers/live-harness.ts`.
3. Add a focused `tests/live/*.live.test.ts` file for the command surface you are extending.

Keep the live tests serial, tiny, and durable. Prefer asserting on exit codes, transaction identifiers, and simple readbacks over timing-sensitive behavior.
