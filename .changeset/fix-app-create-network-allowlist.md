---
"@alchemy/cli": patch
---

Fix `app create` failing with HTTP 400. The CLI was sending `chainNetworks` in the POST body, but the Admin API expects `networkAllowlist`.
