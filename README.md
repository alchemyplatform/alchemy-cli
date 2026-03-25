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

Authentication is required before making requests. Configure auth first, then run commands.

If you are using the CLI as a human in an interactive terminal, the easiest path is:

```bash
alchemy
```

Then follow the setup flow in the terminal UI to configure auth.

Know which auth method does what:

- **API key** - direct auth for blockchain queries (`balance`, `tx`, `block`, `nfts`, `tokens`, `rpc`)
- **Access key** - Admin/API app management; app setup/selection can also provide API key auth for blockchain queries
- **x402 wallet auth** - wallet-authenticated, pay-per-request model for supported blockchain queries

If you use Notify webhooks, add webhook auth on top via `alchemy config set webhook-api-key <key>`, `--webhook-api-key`, or `ALCHEMY_WEBHOOK_API_KEY`.

For setup commands, env vars, and resolution order, see [Authentication Reference](#authentication-reference).

### Usage By Workflow

After auth is configured, use the CLI differently depending on who is driving it:

- **Humans (interactive terminal):** start with `alchemy` and use the terminal UI/setup flow; this is the recommended path for human usage
- **Agents/scripts (automation):** use `--json --no-interactive` to guarantee JSON output and disable prompts (JSON is auto-enabled when piped, but `--json` is a safe default)

Quick usage examples:

```bash
# Human recommended entrypoint
alchemy

# Agent/script-friendly command
alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --json --no-interactive

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

### Node

| Command | What it does | Example |
|---|---|---|
| `balance [address]` (`bal [address]`) | Gets ETH balance for an address | `alchemy bal 0x...` |
| `tx [hash]` | Gets transaction + receipt by hash | `alchemy tx 0x...` |
| `receipt [hash]` | Gets transaction receipt (status, gas, logs) | `alchemy receipt 0x...` |
| `block <number>` | Gets block details (`latest`, decimal, or hex) | `alchemy block latest` |
| `gas` | Gets current gas prices (base fee + priority fee) | `alchemy gas -n polygon-mainnet` |
| `logs` | Queries event logs (`eth_getLogs`) | `alchemy logs --address 0x... --from-block 18000000 --to-block 18000010` |
| `rpc <method> [params...]` | Makes raw JSON-RPC call | `alchemy rpc eth_blockNumber` |
| `trace <method> [params...]` | Calls Trace API methods | `alchemy trace call '{"to":"0x..."}' '["trace"]' latest` |
| `debug <method> [params...]` | Calls Debug API methods | `alchemy debug traceTransaction "0x..."` |

### Data

| Command | What it does | Example |
|---|---|---|
| `tokens [address]` | Lists ERC-20 balances for an address | `alchemy tokens 0x...` |
| `tokens metadata <contract>` | Gets ERC-20 metadata | `alchemy tokens metadata 0x...` |
| `tokens allowance --owner --spender --contract` | Gets ERC-20 allowance | `alchemy tokens allowance --owner 0x... --spender 0x... --contract 0x...` |
| `nfts [address]` | Lists NFTs owned by an address | `alchemy nfts 0x...` |
| `nfts metadata --contract <addr> --token-id <id>` | Gets NFT metadata by contract/token | `alchemy nfts metadata --contract 0x... --token-id 1` |
| `nfts contract <address>` | Gets NFT contract metadata | `alchemy nfts contract 0x...` |
| `transfers [address]` | Gets transfer history (`alchemy_getAssetTransfers`) | `alchemy transfers 0x... --category erc20,erc721` |
| `prices symbol <symbols>` | Gets current token prices by symbol | `alchemy prices symbol ETH,USDC` |
| `prices address --addresses <json>` | Gets current token prices by address/network pairs | `alchemy prices address --addresses '[{"network":"eth-mainnet","address":"0x..."}]'` |
| `prices historical --body <json>` | Gets historical prices | `alchemy prices historical --body '{"symbol":"ETH","startTime":"...","endTime":"..."}'` |
| `portfolio tokens --body <json>` | Gets token portfolio data | `alchemy portfolio tokens --body '{...}'` |
| `portfolio token-balances --body <json>` | Gets token balance snapshots | `alchemy portfolio token-balances --body '{...}'` |
| `portfolio nfts --body <json>` | Gets NFT portfolio data | `alchemy portfolio nfts --body '{...}'` |
| `portfolio nft-contracts --body <json>` | Gets NFT contract portfolio data | `alchemy portfolio nft-contracts --body '{...}'` |
| `portfolio transactions --body <json>` | Gets portfolio transaction history | `alchemy portfolio transactions --body '{...}'` |
| `simulate asset-changes --tx <json>` | Simulates asset changes | `alchemy simulate asset-changes --tx '{"from":"0x...","to":"0x..."}'` |
| `simulate execution --tx <json>` | Simulates execution traces | `alchemy simulate execution --tx '{"from":"0x...","to":"0x..."}'` |
| `simulate asset-changes-bundle --txs <json>` | Simulates bundle asset changes | `alchemy simulate asset-changes-bundle --txs '[{...}]'` |
| `simulate execution-bundle --txs <json>` | Simulates bundle execution traces | `alchemy simulate execution-bundle --txs '[{...}]'` |

### Wallets

| Command | What it does | Example |
|---|---|---|
| `wallet generate` | Generates wallet for x402 and saves to config | `alchemy wallet generate` |
| `wallet import <path>` | Imports wallet key file for x402 | `alchemy wallet import ./private-key.txt` |
| `wallet address` | Prints configured wallet address | `alchemy wallet address` |
| `bundler send-user-operation ...` | Sends ERC-4337 user op | `alchemy bundler send-user-operation --user-op '{...}' --entry-point 0x...` |
| `bundler estimate-user-operation-gas ...` | Estimates ERC-4337 user op gas | `alchemy bundler estimate-user-operation-gas --user-op '{...}' --entry-point 0x...` |
| `bundler get-user-operation-receipt ...` | Gets ERC-4337 user op receipt | `alchemy bundler get-user-operation-receipt --user-op-hash 0x...` |
| `gas-manager request-gas-and-paymaster --body <json>` | Requests paymaster data | `alchemy gas-manager request-gas-and-paymaster --body '{...}'` |
| `gas-manager request-paymaster-token-quote --body <json>` | Gets paymaster token quote | `alchemy gas-manager request-paymaster-token-quote --body '{...}'` |
| `webhooks list` | Lists Notify webhooks | `alchemy webhooks list --webhook-api-key <key>` |
| `webhooks create --body <json>` | Creates Notify webhook | `alchemy webhooks create --body '{...}' --webhook-api-key <key>` |
| `webhooks update --body <json>` | Updates Notify webhook | `alchemy webhooks update --body '{...}' --webhook-api-key <key>` |
| `webhooks delete <id>` | Deletes Notify webhook | `alchemy webhooks delete <id> --webhook-api-key <key>` |

### Chains

| Command | What it does | Example |
|---|---|---|
| `network list` | Lists supported RPC networks | `alchemy network list --configured` |
| `chains list` | Lists Admin API chain enums | `alchemy chains list` |
| `solana rpc <method> [params...]` | Calls Solana JSON-RPC methods | `alchemy solana rpc getBalance '"<pubkey>"'` |
| `solana das <method> [params...]` | Calls Solana DAS methods | `alchemy solana das getAssetsByOwner '{"ownerAddress":"<pubkey>"}'` |

### CLI Admin

| Command | What it does | Example |
|---|---|---|
| `(no command)` | Starts interactive REPL mode (TTY only) | `alchemy` |
| `apps list` | Lists apps (supports pagination/filtering) | `alchemy apps list --all` |
| `apps get <id>` | Gets app details | `alchemy apps get <app-id>` |
| `apps create` | Creates app | `alchemy apps create --name "My App" --networks eth-mainnet` |
| `apps update <id>` | Updates app name/description | `alchemy apps update <app-id> --name "New Name"` |
| `apps delete <id>` | Deletes app | `alchemy apps delete <app-id>` |
| `apps networks <id>` | Updates app network allowlist | `alchemy apps networks <app-id> --networks eth-mainnet,polygon-mainnet` |
| `apps address-allowlist <id>` | Updates app address allowlist | `alchemy apps address-allowlist <app-id> --addresses 0xabc,0xdef` |
| `apps origin-allowlist <id>` | Updates app origin allowlist | `alchemy apps origin-allowlist <app-id> --origins https://example.com` |
| `apps ip-allowlist <id>` | Updates app IP allowlist | `alchemy apps ip-allowlist <app-id> --ips 1.2.3.4,5.6.7.8` |
| `setup status` | Shows setup status + next commands | `alchemy setup status` |
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
| `nfts` | `--limit <n>`, `--page-key <key>` |
| `nfts metadata` | `--contract <address>` (required), `--token-id <id>` (required) |
| `tokens` | `--page-key <key>` |
| `tokens allowance` | `--owner <address>` (required), `--spender <address>` (required), `--contract <address>` (required) |
| `transfers` | `--from-address <address>`, `--to-address <address>`, `--from-block <block>`, `--to-block <block>`, `--category <list>`, `--max-count <n>`, `--page-key <key>` |
| `prices address` | `--addresses <json>` (required) |
| `prices historical` | `--body <json>` (required) |
| `portfolio *` | `--body <json>` (required per subcommand) |
| `simulate *` | `--tx <json>` or `--txs <json>` (required) |
| `webhooks *` | `--webhook-api-key <key>` (or `ALCHEMY_WEBHOOK_API_KEY`, `ALCHEMY_NOTIFY_AUTH_TOKEN`, config `webhook-api-key`, or app webhook key) |
| `bundler send-user-operation` | `--user-op <json>` (required), `--entry-point <address>` (required) |
| `bundler estimate-user-operation-gas` | `--user-op <json>` (required), `--entry-point <address>` (required), `--state-override <json>` |
| `bundler get-user-operation-receipt` | `--user-op-hash <hash>` (required) |
| `gas-manager *` | `--body <json>` (required) |
| `apps list` | `--cursor <cursor>`, `--limit <n>`, `--all`, `--search <query>`, `--id <appId>` |
| `apps create` | `--name <name>` (required), `--networks <networks>` (required), `--description <desc>`, `--products <products>`, `--dry-run` |
| `apps update` | `--name <name>`, `--description <desc>`, `--dry-run` |
| `apps delete` | `--dry-run` |
| `apps networks` | `--networks <networks>` (required), `--dry-run` |
| `apps address-allowlist` | `--addresses <addrs>` (required), `--dry-run` |
| `apps origin-allowlist` | `--origins <origins>` (required), `--dry-run` |
| `apps ip-allowlist` | `--ips <ips>` (required), `--dry-run` |
| `network list` | `--configured`, `--app-id <id>` |
| `config reset` | `-y, --yes` |

## Authentication Reference

The CLI supports three auth inputs:

- API key for blockchain queries (`balance`, `tx`, `block`, `nfts`, `tokens`, `rpc`)
- Access key for Admin API operations (`apps`, `chains`, configured network lookups`) and app setup/selection, which can also supply the API key used by blockchain query commands
- x402 wallet key for wallet-authenticated blockchain queries in a pay-per-request model

Notify/webhook commands use a webhook API key with resolution order:
`--webhook-api-key` -> `ALCHEMY_WEBHOOK_API_KEY` -> `ALCHEMY_NOTIFY_AUTH_TOKEN` -> config `webhook-api-key` -> configured app webhook key.

Get API/access keys at [alchemy.com](https://dashboard.alchemy.com/).

#### API key

```bash
# Config
alchemy config set api-key <your-key>

# Environment variable
export ALCHEMY_API_KEY=<your-key>

# Per-command override
alchemy balance 0x... --api-key <your-key>
```

Resolution order: `--api-key` -> `ALCHEMY_API_KEY` -> config file -> configured app API key.

#### Access key

```bash
# Config (in TTY, this may trigger app setup flow)
alchemy config set access-key <your-key>

# Environment variable
export ALCHEMY_ACCESS_KEY=<your-key>

# Per-command override
alchemy apps list --access-key <your-key>
```

Resolution order: `--access-key` -> `ALCHEMY_ACCESS_KEY` -> config file.

#### x402 wallet auth

x402 is a wallet-authenticated, pay-per-request usage model for supported blockchain queries.
The CLI can generate or import the wallet key used for these requests.

```bash
# Generate/import a wallet managed by CLI
alchemy wallet generate
# or
alchemy wallet import ./private-key.txt

# Use x402 per command
alchemy balance 0x... --x402

# Or enable by default
alchemy config set x402 true
```

Generated/imported wallets are stored as unique key files under `~/.config/alchemy/wallet-keys/` so creating another wallet does not overwrite prior private keys.

You can also provide wallet key directly:

```bash
export ALCHEMY_WALLET_KEY=0x...
```

Wallet key resolution order: `--wallet-key-file` -> `ALCHEMY_WALLET_KEY` -> `wallet-key-file` in config.

## REPL Mode

Run `alchemy` with no command in an interactive terminal:

```bash
alchemy
alchemy ◆ balance 0x...
alchemy ◆ block latest
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
