---
"@alchemy/cli": minor
---

Add a `--headless` flag (alias `--no-browser`) to `alchemy auth login` for remote/SSH machines where the browser's redirect to the local callback server is unreachable. Headless mode opens no browser and starts no callback server: it prints the authorize URL, then accepts the pasted redirect URL (or just the `code`) and completes the login. It reuses the existing PKCE flow with no auth-server changes; state is validated when present and PKCE protects raw-code pastes. In non-interactive/`--json` mode the code is read from stdin.
