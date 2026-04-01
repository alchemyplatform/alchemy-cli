---
"@alchemy/cli": patch
---

Fix update notice so `npm i -g @alchemy/cli@latest` is suggested (forces npm to fetch the newest version) and clear the update-check cache on postinstall to prevent stale "update available" messages after upgrading.
