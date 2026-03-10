# Alchemy CLI

Alchemy CLI is a command-line tool for querying blockchain data and managing Alchemy apps/configuration.
It supports both human-friendly terminal output and JSON output for automation.
You can use API keys, access keys, or x402 wallet auth depending on the command.

## Installation

The current repository workflow is source install:

```bash
git clone https://github.com/alchemyplatform/alchemy-cli.git
cd alchemy-cli
pnpm install
pnpm build
pnpm link --global
```

This makes the `alchemy` command available globally.  
To unlink later: `pnpm unlink --global`.

## Command Reference

Run commands as `alchemy <command>`.
Use `alchemy help` or `alchemy help <command>` for generated command help.

| Command | What it does | Example |
|---|---|---|
| `(no command)` | Starts interactive REPL mode (TTY only) | `alchemy` |
| `balance [address]` (`bal [address]`) | Gets ETH balance for an address | `alchemy bal 0x...` |
| `tx [hash]` | Gets transaction + receipt by hash | `alchemy tx 0x...` |
| `block <number>` | Gets block details (`latest`, decimal, or hex) | `alchemy block latest` |
| `nfts [address]` | Lists NFTs owned by an address | `alchemy nfts 0x...` |
| `tokens [address]` | Lists ERC-20 balances for an address | `alchemy tokens 0x...` |
| `rpc <method> [params...]` | Makes raw JSON-RPC call | `alchemy rpc eth_blockNumber` |
| `apps list` | Lists apps (supports pagination/filtering) | `alchemy apps list --all` |
| `apps get <id>` | Gets app details | `alchemy apps get <app-id>` |
| `apps create` | Creates app | `alchemy apps create --name "My App" --networks eth-mainnet` |
| `apps update <id>` | Updates app name/description | `alchemy apps update <app-id> --name "New Name"` |
| `apps delete <id>` | Deletes app | `alchemy apps delete <app-id>` |
| `apps networks <id>` | Updates app network allowlist | `alchemy apps networks <app-id> --networks eth-mainnet,polygon-mainnet` |
| `apps address-allowlist <id>` | Updates app address allowlist | `alchemy apps address-allowlist <app-id> --addresses 0xabc,0xdef` |
| `apps origin-allowlist <id>` | Updates app origin allowlist | `alchemy apps origin-allowlist <app-id> --origins https://example.com` |
| `apps ip-allowlist <id>` | Updates app IP allowlist | `alchemy apps ip-allowlist <app-id> --ips 1.2.3.4,5.6.7.8` |
| `chains list` | Lists Admin API chain enums | `alchemy chains list` |
| `network list` | Lists supported RPC networks | `alchemy network list --configured` |
| `setup status` | Shows setup status + next commands | `alchemy setup status` |
| `wallet generate` | Generates wallet for x402 and saves to config | `alchemy wallet generate` |
| `wallet import <path>` | Imports wallet key file for x402 | `alchemy wallet import ./private-key.txt` |
| `wallet address` | Prints configured wallet address | `alchemy wallet address` |
| `config set ...` | Sets config values | `alchemy config set api-key <key>` |
| `config get <key>` | Gets one config value | `alchemy config get network` |
| `config list` | Lists all config values | `alchemy config list` |
| `config reset [key]` | Resets one or all config values | `alchemy config reset --yes` |
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
| `--json` | — | Force JSON output |
| `-q, --quiet` | — | Suppress non-essential output |
| `-v, --verbose` | — | Enable verbose output |
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

### Command-specific flags

| Command | Flags |
|---|---|
| `nfts` | `--limit <n>`, `--page-key <key>` |
| `tokens` | `--page-key <key>` |
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

## Authentication

The CLI supports three auth inputs:

- API key for blockchain queries (`balance`, `tx`, `block`, `nfts`, `tokens`, `rpc`)
- Access key for Admin API operations (`apps`, `chains`, configured network lookups)
- x402 wallet key for wallet-authenticated blockchain queries

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

- TTY: formatted human output
- Non-TTY: JSON output (script-friendly)
- `--json`: forces JSON output in any context
- `--verbose` or `alchemy config set verbose true`: includes richer payload output on supported commands

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

## Development

Prerequisites:

- [Node.js 18+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

Run during development:

```bash
# Run without building
npx tsx src/index.ts balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Build in watch mode
pnpm dev
```

Build:

```bash
pnpm build
```

Test:

```bash
pnpm test
pnpm test:e2e
```

Type check:

```bash
pnpm lint
```

Coverage:

```bash
pnpm test:coverage
```

### Endpoint Override Env Vars (Local Testing Only)

These are for local/mock testing, not normal production usage:

- `ALCHEMY_RPC_BASE_URL`
- `ALCHEMY_ADMIN_API_BASE_URL`
- `ALCHEMY_X402_BASE_URL`

Safety constraints:

- Only localhost targets are accepted (`localhost`, `127.0.0.1`, `::1`)
- Non-HTTPS transport is allowed only for localhost
- Production defaults are unchanged when unset
