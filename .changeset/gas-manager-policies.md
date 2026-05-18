---
"@alchemy/cli": minor
---

Add Gas Manager policy management.

- New `alchemy gas-manager policy {list,get,create,activate}` for listing, fetching, interactive creation, and activating gas sponsorship policies via the `manage.g.alchemy.com` admin API. Requires `alchemy auth login` (this surface intentionally does not accept access keys — user auth only).
- When `--gas-sponsored` / `--fee-sponsored` is set without a policy ID, the CLI now prompts the user to select an existing policy or create a new one (sponsorship for EVM, solana for Solana), then optionally saves the selection as default. Non-interactive / not-logged-in cases fall through to a clear error with guidance.
- `alchemy config set evm-gas-policy-id` and `solana-fee-policy-id` now accept an optional argument: omit it to run the interactive select/create flow.
