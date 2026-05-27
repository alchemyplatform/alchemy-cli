---
"@alchemy/cli": patch
---

Mask webhook HMAC signing keys and app RPC URLs in CLI JSON output, treat a single JSON array passed to `alchemy evm rpc` as the full JSON-RPC params array, and preserve NETWORK_ERROR classification for SDK-wrapped fetch failures.
