---
"@alchemy/cli": minor
---

Default `alchemy wallet connect` to session wallets and require explicit `--mode local` when users need to create or import local wallet keys.

Scripts that previously used `alchemy wallet connect --import <path>` should now use `alchemy wallet connect --mode local --import <path>`.
