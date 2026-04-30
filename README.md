# Alchemy CLI

Alchemy CLI is a command-line tool for querying blockchain data and managing Alchemy apps/configuration.
It supports both human-friendly terminal output and JSON output for automation.
You can use API keys, access keys, or x402 wallet auth depending on the command.

## Installation

Install globally from npm:

```bash
npm i -g @alchemy/cli
```

Or run without installing globally:

```bash
npx @alchemy/cli <command>
```

## Shell Completions

Enable Tab completion for all commands and subcommands:

```bash
# zsh (add to ~/.zshrc)
echo 'eval "$(alchemy completions zsh)"' >> ~/.zshrc
source ~/.zshrc

# bash (add to ~/.bashrc)
echo 'eval "$(alchemy completions bash)"' >> ~/.bashrc
source ~/.bashrc

# fish
alchemy completions fish > ~/.config/fish/completions/alchemy.fish
```

## Getting Started

### Authentication Quick Start

Authentication is required before making requests. The recommended path is browser login:

```bash
alchemy auth
```

This opens a browser to link your Alchemy account, then prompts you to select an app. The selected app's API key is saved to your config automatically. Pass `-y` to skip the confirmation prompt.

If you run `alchemy` with no command and no auth configured, the CLI will guide you through browser login automatically.

If you have an auth token but haven't selected an app yet, the CLI will prompt you to pick one before running any command that requires an API key. Teams with many apps can type to search by name.

If you use Notify webhooks, add webhook auth on top via `alchemy config set webhook-api-key <key>`, `--webhook-api-key`, or `ALCHEMY_WEBHOOK_API_KEY`.

### Usage By Workflow

After auth is configured, use the CLI differently depending on who is driving it:

- **Humans (interactive terminal):** start with `alchemy` and use the terminal UI/setup flow; this is the recommended path for human usage
- **Agents/scripts (automation):** use `--json --no-interactive` to guarantee JSON output and disable prompts (JSON is auto-enabled when piped, but `--json` is a safe default)

Quick usage examples:

```bash
# Human recommended entrypoint
alchemy

# Agent/script-friendly command
alchemy evm data balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --json --no-interactive

# Agent checks whether a newer CLI version is available
alchemy update-check --json --no-interactive
```

#### Agent bootstrap

Have your agent run `agent-prompt` as its first step to get a complete, machine-readable contract describing every command, auth method, error code, and execution rule:

```bash
# Agent runs this once to learn everything the CLI can do
alchemy --json agent-prompt
```

This returns a single JSON document with execution policy, preflight instructions, auth matrix, the full command tree with all arguments and options, error codes with recovery actions, and example invocations. No external docs required.

Agents can also call `alchemy --json --no-interactive update-check` to retrieve the current CLI version, latest known version, and install command for upgrades.

## Command Reference

Run commands as `alchemy <command>`.
Use `alchemy help` or `alchemy help <command>` for generated command help.

### EVM

| Command | What it does | Example |
|---|---|---|
| `evm rpc <method> [params...]` | Makes raw Ethereum JSON-RPC calls | `alchemy evm rpc eth_blockNumber` |
| `evm data balance [address]` | Gets native token balance for an address | `alchemy evm data balance 0x...` |
| `evm data tokens balances [address]` | Lists ERC-20 balances for an address | `alchemy evm data tokens balances 0x...` |
| `evm data nfts [address]` | Lists NFTs owned by an address | `alchemy evm data nfts 0x...` |
| `evm data history [address]` | Gets transfer history (`alchemy_getAssetTransfers`) | `alchemy evm data history 0x... --category erc20,erc721` |
| `evm data price symbol <symbols>` | Gets current token prices by symbol | `alchemy evm data price symbol ETH,USDC` |
| `evm data portfolio tokens --body <json>` | Gets token portfolio data | `alchemy evm data portfolio tokens --body '{...}'` |
| `evm send <to> <amount>` | Sends native tokens or ERC-20 tokens | `alchemy evm send vitalik.eth 0.1 -n base-mainnet` |
| `evm contract read/call` | Reads or writes smart contracts | `alchemy evm contract read 0x... "balanceOf(address)(uint256)" --args '["0x..."]'` |
| `evm swap quote/execute` | Swaps tokens on the same chain | `alchemy evm swap quote --from 0xEeee... --to 0xA0b8... --amount 1` |
| `evm approve <spender_address>` | Approves an ERC-20 token allowance | `alchemy evm approve 0x... --token-address 0x... --amount 10` |
| `evm status [id]` | Checks transaction or operation status | `alchemy evm status 0x...` |
| `evm network list` | Lists RPC network IDs for use with `--network` | `alchemy evm network list --search base` |
| `evm tx/receipt/block/gas/logs` | Fetches common node resources | `alchemy evm block latest` |
| `evm trace/debug` | Calls Trace and Debug API methods | `alchemy evm trace call '{"to":"0x..."}' '["trace"]' latest` |
| `evm simulate *` | Calls simulation APIs | `alchemy evm simulate execution --tx '{"to":"0x..."}'` |

### Wallets

`alchemy wallets` exposes a unified onchain-actions surface. The **session wallet** (Alchemy/Privy-managed, P-256 delegated signer) is the recommended flow; a **local wallet** (private key stored on disk) is supported as an alternative and is currently the only path for Solana.

| Command | What it does | Example |
|---|---|---|
| `wallets connect` | Interactive: choose a session wallet (recommended) or a local wallet. For scripts, pass `--mode <session\|local>`. | `alchemy wallets connect` |
| `wallets connect --mode local --chain evm` | Create a new local EVM key (non-interactive). `--chain` accepts `evm`, `solana`, or `both`. | `alchemy wallets connect --mode local --chain both` |
| `wallets connect --mode local --import <path>` | Import an existing EVM private key from a file. | `alchemy wallets connect --mode local --import ./key.txt` |
| `wallets status [--verify]` | Reports session, local EVM, local Solana, and the active signer. `--verify` reconciles the session with the backend. | `alchemy wallets status --verify` |
| `wallets address` | Prints addresses for every configured signer. | `alchemy wallets address` |
| `wallets use <session\|local>` | Selects which signer `evm send`, `evm swap`, `evm approve`, `xchain bridge`, and `evm contract call` use for EVM transactions. | `alchemy wallets use local` |
| `wallets disconnect` | Revokes the current session (local + backend). Clears `active_signer` if it pointed at the session. | `alchemy wallets disconnect` |
| `wallets qr [--type <evm\|solana>]` | Renders a configured address as a QR code. | `alchemy wallets qr --type evm` |

Per-command override: pass `--signer <session\|local>` to `evm send`, `evm approve`, `evm swap`, `xchain bridge`, or `evm contract call` to override the active signer for a single invocation.
| `webhooks list` | Lists Notify webhooks | `alchemy webhooks list --webhook-api-key <key>` |
| `webhooks create --body <json>` | Creates Notify webhook | `alchemy webhooks create --body '{...}' --webhook-api-key <key>` |
| `webhooks update --body <json>` | Updates Notify webhook | `alchemy webhooks update --body '{...}' --webhook-api-key <key>` |
| `webhooks delete <id>` | Deletes Notify webhook | `alchemy webhooks delete <id> --webhook-api-key <key>` |

### Chains

| Command | What it does | Example |
|---|---|---|
| `solana rpc <method> [params...]` | Calls Solana JSON-RPC methods | `alchemy solana rpc getBalance '"<pubkey>"'` |
| `solana das <method> [params...]` | Calls Solana DAS methods | `alchemy solana das getAssetsByOwner '{"ownerAddress":"<pubkey>"}'` |
| `solana network list` | Lists networks from the Solana namespace | `alchemy solana network list --search solana` |
| `xchain bridge quote/execute` | Bridges tokens across chains | `alchemy xchain bridge quote --from 0xEeee... --to 0xEeee... --amount 0.1 --to-network base-mainnet -n eth-mainnet` |

### CLI Admin

| Command | What it does | Example |
|---|---|---|
| `(no command)` | Starts interactive REPL mode (TTY only) | `alchemy` |
| `auth` (`auth login`) | Log in via browser (PKCE) | `alchemy auth` |
| `auth status` | Show current authentication status | `alchemy auth status` |
| `auth logout` | Clear saved authentication token | `alchemy auth logout` |
| `apps list` | Lists apps (supports pagination/filtering) | `alchemy apps list --all` |
| `apps chains` | Lists Admin API chain identifiers (e.g. `ETH_MAINNET`) | `alchemy apps chains` |
| `apps get <id>` | Gets app details | `alchemy apps get <app-id>` |
| `apps create` | Creates app | `alchemy apps create --name "My App" --networks eth-mainnet` |
| `apps update <id>` | Updates app name/description | `alchemy apps update <app-id> --name "New Name"` |
| `apps delete <id>` | Deletes app | `alchemy apps delete <app-id>` |
| `apps networks <id>` | Updates app network allowlist | `alchemy apps networks <app-id> --networks eth-mainnet,polygon-mainnet` |
| `apps address-allowlist <id>` | Updates app address allowlist | `alchemy apps address-allowlist <app-id> --addresses 0xabc,0xdef` |
| `apps origin-allowlist <id>` | Updates app origin allowlist | `alchemy apps origin-allowlist <app-id> --origins https://example.com` |
| `apps ip-allowlist <id>` | Updates app IP allowlist | `alchemy apps ip-allowlist <app-id> --ips 1.2.3.4,5.6.7.8` |
| `doctor` | Runs readiness checks and suggestions | `alchemy doctor` |
| `install mcp` | Installs Alchemy's remote MCP server config | `alchemy install mcp --client claude --dry-run` |
| `install skills` | Installs bundled Alchemy skills | `alchemy install skills --client cursor --dry-run` |
| `update-check` | Checks whether a newer CLI version is available | `alchemy update-check --json --no-interactive` |
| `config set ...` | Sets config values | `alchemy config set api-key <key>` |
| `config get <key>` | Gets one config value | `alchemy config get network` |
| `config list` | Lists all config values | `alchemy config list` |
| `config reset [key]` | Resets one or all config values | `alchemy config reset --yes` |
| `completions <shell>` | Generates shell completion scripts (bash/zsh/fish) | `eval "$(alchemy completions zsh)"` |
| `agent-prompt` | Emits complete agent/automation usage instructions | `alchemy --json agent-prompt` |
| `version` | Prints CLI version | `alchemy version` |

## Flags

### Global flags

These apply to all commands.

#### Auth & network

| Flag | Env var | Description |
|---|---|---|
| `--api-key <key>` | `ALCHEMY_API_KEY` | API key for blockchain query commands |
| `--access-key <key>` | `ALCHEMY_ACCESS_KEY` | Access key for Admin API operations |
| `-n, --network <network>` | `ALCHEMY_NETWORK` | Target network (default: `eth-mainnet`) |
| `--x402` | — | Enable x402 wallet-based gateway auth |
| `--wallet-key-file <path>` | — | Wallet private key file for x402 auth |

#### Output & formatting

| Flag | Env var | Description |
|---|---|---|
| `--json` | — | Force JSON output (auto-enabled when piped) |
| `-q, --quiet` | — | Suppress non-essential output |
| `--verbose` | — | Enable verbose output |
| `--no-color` | `NO_COLOR` | Disable color output |
| `--reveal` | — | Show secrets in plain text (TTY only) |

#### Runtime & behavior

| Flag | Env var | Description |
|---|---|---|
| `--timeout <ms>` | — | Request timeout in milliseconds |
| `--debug` | — | Enable internal debug diagnostics |
| `--no-interactive` | — | Disable REPL and prompt-driven interactions |

Additional env vars:

| Env var | Description |
|---|---|
| `ALCHEMY_CONFIG` | Custom path to config file |
| `ALCHEMY_WALLET_KEY` | Wallet private key for x402 auth |
| `ALCHEMY_WEBHOOK_API_KEY` | Webhook API key for Notify commands |

### Command-specific flags

| Command | Flags |
|---|---|
| `auth login` | `--force`, `-y, --yes` |
| `evm data nfts` | `--limit <n>`, `--page-key <key>` |
| `evm data nfts metadata` | `--contract <address>` (required), `--token-id <id>` (required) |
| `evm data tokens balances` | `--page-key <key>` |
| `evm data tokens allowance` | `--owner <address>` (required), `--spender <address>` (required), `--contract <address>` (required) |
| `evm data history` | `--from-address <address>`, `--to-address <address>`, `--from-block <block>`, `--to-block <block>`, `--category <list>`, `--max-count <n>`, `--page-key <key>` |
| `evm data price address` | `--addresses <json>` (required) |
| `evm data price historical` | `--body <json>` (required) |
| `evm data portfolio *` | `--body <json>` (required per subcommand) |
| `evm simulate *` | `--tx <json>` or `--txs <json>` (required) |
| `webhooks *` | `--webhook-api-key <key>` (or `ALCHEMY_WEBHOOK_API_KEY`, `ALCHEMY_NOTIFY_AUTH_TOKEN`, config `webhook-api-key`, or app webhook key) |
| `apps list` | `--cursor <cursor>`, `--limit <n>`, `--all`, `--search <query>`, `--id <appId>` |
| `apps create` | `--name <name>` (required), `--networks <networks>` (required), `--description <desc>`, `--products <products>`, `--dry-run` |
| `apps update` | `--name <name>`, `--description <desc>`, `--dry-run` |
| `apps delete` | `--dry-run` |
| `apps networks` | `--networks <networks>` (required), `--dry-run` |
| `apps address-allowlist` | `--addresses <addrs>` (required), `--dry-run` |
| `apps origin-allowlist` | `--origins <origins>` (required), `--dry-run` |
| `apps ip-allowlist` | `--ips <ips>` (required), `--dry-run` |
| `evm network list` | `--mainnet-only`, `--testnet-only`, `--search <term>` |
| `config reset` | `-y, --yes` |

## Authentication Reference

```bash
# Interactive login — opens browser to link your Alchemy account
alchemy auth

# Skip the confirmation prompt
alchemy auth -y

# Force re-authentication
alchemy auth login --force

# Check auth status
alchemy auth status

# Log out
alchemy auth logout
```

After login, the CLI prompts you to select an app. The app's API key is saved to config and used for all subsequent commands. If you skip app selection during login, the CLI will prompt you to pick one before running any command that needs an API key.

Notify/webhook commands use a webhook API key with resolution order:
`--webhook-api-key` -> `ALCHEMY_WEBHOOK_API_KEY` -> `ALCHEMY_NOTIFY_AUTH_TOKEN` -> config `webhook-api-key` -> configured app webhook key.

## REPL Mode

Run `alchemy` with no command in an interactive terminal:

```bash
alchemy
alchemy ◆ evm data balance 0x...
alchemy ◆ evm block latest
alchemy ◆ exit
```

Use `--no-interactive` to disable REPL/prompts in automation.

## Output Modes

- **TTY (terminal):** formatted human output (tables, colors, spinners)
- **Non-TTY (piped/redirected):** JSON output automatically — no flag needed
- `--json`: forces JSON output even in a terminal
- `--verbose` or `alchemy config set verbose true`: logs request/response details (method, URL, status, timing) to stderr

## Error Format

Errors are structured JSON in JSON mode:

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Not authenticated. Set ALCHEMY_API_KEY or run 'alchemy config set api-key <key>'.",
    "hint": "alchemy config set api-key <your-key>"
  }
}
```
