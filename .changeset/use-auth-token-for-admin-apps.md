---
"@alchemy/cli": minor
---

Use the browser login auth token for Admin API app operations, removing deprecated legacy admin auth guidance from the CLI.

Route wallet-operation helper RPC calls through explicit API-key client construction, so wallet sends do not depend on x402 configuration, and point missing EVM wallets at `alchemy wallet connect`.

Require `-n/--network` for networked CLI commands instead of using hidden `eth-mainnet` or `solana-mainnet` defaults, and remove the persisted `config set network` surface.
