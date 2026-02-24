# Alchemy CLI

A command-line interface for interacting with blockchain data via the [Alchemy](https://www.alchemy.com/) API. Agent-first — optimized for LLM agents, while still great for humans.

## Installation

```bash
pnpm add -g @alchemyplatform/cli
```

## Authentication

Set your Alchemy API key (get one at [alchemy.com](https://dashboard.alchemy.com/)):

```bash
# Option 1: config file
alchemy config set api-key <your-key>

# Option 2: environment variable
export ALCHEMY_API_KEY=<your-key>

# Option 3: per-command flag
alchemy balance 0x... --api-key <your-key>
```

Resolution order: `--api-key` flag → `ALCHEMY_API_KEY` env var → config file.

## Usage

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

### List supported networks

```bash
alchemy network list
```

### Manage configuration

```bash
alchemy config set api-key <key>
alchemy config set network polygon-mainnet
alchemy config get api-key
alchemy config list
```

## Global Flags

| Flag | Env Var | Description |
|------|---------|-------------|
| `--api-key` | `ALCHEMY_API_KEY` | API key for requests |
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
