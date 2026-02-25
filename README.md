# Alchemy CLI

A command-line interface for interacting with blockchain data via the [Alchemy](https://www.alchemy.com/) API. Agent-first — optimized for LLM agents, while still great for humans.

## Installation

```bash
pnpm add -g @alchemyplatform/cli
```

## Authentication

The CLI uses two types of keys:

- **API key** — for blockchain queries (balance, tx, block, nfts, tokens, rpc)
- **Access key** — for the Admin API (apps, chains)

Get both at [alchemy.com](https://dashboard.alchemy.com/).

### API key

```bash
# Option 1: config file
alchemy config set api-key <your-key>

# Option 2: environment variable
export ALCHEMY_API_KEY=<your-key>

# Option 3: per-command flag
alchemy balance 0x... --api-key <your-key>
```

Resolution order: `--api-key` flag → `ALCHEMY_API_KEY` env var → config file → configured app's API key.

### Access key

```bash
# Option 1: config file (triggers interactive app setup in TTY)
alchemy config set access-key <your-key>

# Option 2: environment variable
export ALCHEMY_ACCESS_KEY=<your-key>

# Option 3: per-command flag
alchemy apps list --access-key <your-key>
```

Resolution order: `--access-key` flag → `ALCHEMY_ACCESS_KEY` env var → config file.

## Usage

### Interactive REPL

Run `alchemy` with no arguments in a terminal to enter interactive mode with tab-completion:

```bash
alchemy
alchemy ◆ balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
alchemy ◆ block latest
alchemy ◆ exit
```

### Get an ETH balance

```bash
alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

### Look up a transaction

```bash
alchemy tx 0xabc123...
```

### Get block details

```bash
alchemy block latest
alchemy block 17000000
```

### List NFTs for an address

```bash
alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

### List ERC-20 token balances

```bash
alchemy tokens 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

### Raw JSON-RPC call

```bash
alchemy rpc eth_blockNumber
alchemy rpc eth_getBalance "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" "latest"
```

### Manage apps

Requires an access key.

```bash
# List all apps
alchemy apps list

# Get app details
alchemy apps get <app-id>

# Create a new app
alchemy apps create --name "My App" --networks eth-mainnet,polygon-mainnet

# Update an app
alchemy apps update <app-id> --name "New Name"

# Delete an app
alchemy apps delete <app-id>

# Update network allowlist
alchemy apps networks <app-id> --networks eth-mainnet,arb-mainnet

# Update address/origin/IP allowlists
alchemy apps address-allowlist <app-id> --addresses 0xabc,0xdef
alchemy apps origin-allowlist <app-id> --origins https://example.com
alchemy apps ip-allowlist <app-id> --ips 1.2.3.4,5.6.7.8
```

### List chain networks

Requires an access key.

```bash
alchemy chains list
```

### List supported networks

```bash
alchemy network list
```

### Manage configuration

```bash
alchemy config set api-key <key>
alchemy config set access-key <key>
alchemy config set app              # interactive app selector
alchemy config set network polygon-mainnet
alchemy config get api-key
alchemy config list
```

### Print version

```bash
alchemy version
```

## Global Flags

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `ALCHEMY_API_KEY` | API key for blockchain queries |
| `--access-key` | `ALCHEMY_ACCESS_KEY` | Access key for Admin API operations |
| `--network, -n` | `ALCHEMY_NETWORK` | Target network (default: `eth-mainnet`) |
| `--json` | — | Force JSON output |
| `--quiet, -q` | — | Suppress non-essential output |
| `--verbose, -v` | — | Debug output |

## Output Modes

The CLI auto-detects your environment:

- **TTY (interactive terminal):** Human-friendly formatted output
- **Non-TTY (piped/scripted):** JSON output for easy parsing
- **`--json` flag:** Force JSON output regardless of environment

## Error Format

Errors are structured JSON when in JSON mode:

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

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Setup

```bash
git clone https://github.com/alchemyplatform/alchemy-cli.git
cd alchemy-cli
pnpm install
```

### Run during development

```bash
pnpm dev -- --help
npx tsx src/index.ts balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

### Build

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Type check

```bash
pnpm lint
```

## Releasing

Publish to npm:

```bash
pnpm build
pnpm publish --access public
```

Users install with:

```bash
pnpm add -g @alchemyplatform/cli
```
