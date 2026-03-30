---
"@alchemy/cli": major
---

Breaking: `tokens <address>` is now `tokens balances <address>`, `tx` no longer includes receipt data (use `receipt` separately), `network list --configured` moved to `apps configured-networks`, and `portfolio transactions` removed (use `transfers`).

New features: `tokens balances --metadata` resolves token symbols and decimals, `network list` supports `--mainnet-only`/`--testnet-only`/`--search`, `webhooks create/update/delete` support `--dry-run`, `agent-prompt --commands` filters JSON output, and `balance` accepts multiple addresses via stdin.
