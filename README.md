# Alchemy CLI

A command-line interface for interacting with blockchain data via the [Alchemy](https://www.alchemy.com/) API. Agent-first — optimized for LLM agents, while still great for humans.

## Installation

```bash
go install github.com/alchemyplatform/alchemy-cli/cmd/alchemy@latest
```

Make sure `$(go env GOBIN)` (or `$(go env GOPATH)/bin`) is in your `$PATH`.

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

- [Go 1.21+](https://go.dev/dl/)

### Setup

```bash
git clone https://github.com/alchemyplatform/alchemy-cli.git
cd alchemy-cli
go mod download
```

### Run during development

```bash
go run ./cmd/alchemy --help
go run ./cmd/alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

This builds and runs in one step — picks up code changes automatically.

### Install locally

```bash
go install ./cmd/alchemy
```

Re-run after changes to update the binary.

### Build a binary

```bash
go build -o alchemy ./cmd/alchemy
```

### Run tests

```bash
go test ./...
```

### Set version at build time

```bash
go build -ldflags "-X github.com/alchemyplatform/alchemy-cli/cmd.Version=1.0.0" -o alchemy ./cmd/alchemy
```

## Releasing

Production releases use [GoReleaser](https://goreleaser.com/). To set up:

1. Install GoReleaser: `go install github.com/goreleaser/goreleaser/v2@latest`
2. Create a `.goreleaser.yaml` config (see below)
3. Tag a release: `git tag v0.1.0 && git push --tags`
4. Build: `goreleaser release`

### `.goreleaser.yaml` (TODO)

```yaml
project_name: alchemy
builds:
  - main: ./cmd/alchemy
    binary: alchemy
    goos: [linux, darwin, windows]
    goarch: [amd64, arm64]
    ldflags:
      - -s -w -X github.com/alchemyplatform/alchemy-cli/cmd.Version={{.Version}}
brews:
  - repository:
      owner: alchemyplatform
      name: homebrew-tap
    name: alchemy
    homepage: https://www.alchemy.com/
    description: Alchemy CLI — interact with blockchain data
```

This enables:

- **Homebrew:** `brew install alchemyplatform/tap/alchemy`
- **Direct download:** Prebuilt binaries for Linux, macOS, and Windows on the GitHub Releases page
- **Go install:** `go install github.com/alchemyplatform/alchemy-cli/cmd/alchemy@latest`
