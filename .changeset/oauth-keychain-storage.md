---
"@alchemy/cli": minor
---

Migrate authentication to standard OAuth 2.0 (PKCE + state validation) and store credentials securely in the OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager) via cross-keychain instead of plaintext config. The displayed login URL is now usable for manual paste, and auth completes immediately whether you press Enter or paste the URL in a browser.
