# Alchemy CLI

A command-line interface for interacting with blockchain data via [Alchemy](https://www.alchemy.com/) APIs. Great for agents, while still great for humans.

## Installation

> **Note:** The npm package is not yet published. For now, install from source:

```bash
git clone https://github.com/alchemyplatform/alchemy-cli.git
cd alchemy-cli
pnpm install
pnpm build
pnpm link --global
```

This makes the `alchemy` command available globally. To unlink later: `pnpm unlink --global`.

## Authentication

The CLI supports three auth inputs:

- **API key** - standard Alchemy blockchain queries (balance, tx, block, nfts, tokens, rpc)
- **x402 wallet key** - wallet-based auth and payment flow for blockchain queries
- **Access key** - Admin API operations (apps, chains)

Create API/access keys at [alchemy.com](https://dashboard.alchemy.com/), and generate or import an x402 wallet key with `alchemy wallet ...`.

### API key (default blockchain auth)

```bash
# Option 1: config file
alchemy config set api-key <your-key>

# Option 2: environment variable
export ALCHEMY_API_KEY=<your-key>

# Option 3: per-command flag
alchemy balance 0x... --api-key <your-key>
```

Resolution order: `--api-key` flag -> `ALCHEMY_API_KEY` env var -> config file -> configured app's API key.

### x402 wallet auth (optional)

Enable x402 per-command:

```bash
alchemy balance 0x... --x402 --wallet-key-file ~/.config/alchemy/wallet-key.txt
```

Or set defaults once:

```bash
alchemy wallet generate                  # creates wallet + stores key file path in config
alchemy config set x402 true            # enable x402 by default
alchemy config set wallet-key-file ~/.config/alchemy/wallet-key.txt
```

You can also provide the private key directly:

```bash
export ALCHEMY_WALLET_KEY=0x...
```

Wallet key resolution order: `--wallet-key-file` flag -> `ALCHEMY_WALLET_KEY` env var -> `wallet-key-file` in config.

### Access key

```bash
# Option 1: config file (triggers interactive app setup in TTY)
alchemy config set access-key <your-key>

# Option 2: environment variable
export ALCHEMY_ACCESS_KEY=<your-key>

# Option 3: per-command flag
alchemy apps list --access-key <your-key>
```

Resolution order: `--access-key` flag -> `ALCHEMY_ACCESS_KEY` env var -> config file.

In TTY mode, access-key onboarding shows a fetch spinner before app selection. If your account has many apps, the selector supports type-to-filter search in a single prompt.
Prompt interactions are rendered as a single finalized transcript line (no duplicated prompt label lines).

## x402 Guide

Use x402 when you want wallet-based authentication (and payment handling) instead of API key auth for blockchain query commands.

### How x402 works in this CLI

When x402 is enabled (`--x402` or `config set x402 true`), blockchain query commands use a wallet-authenticated client instead of API key RPC auth.

Flow per request:

1. The CLI resolves your wallet key from `--wallet-key-file`, then `ALCHEMY_WALLET_KEY`, then saved config.
2. It signs a SIWE token with that private key and sends requests with `Authorization: SIWE <token>`.
3. If the gateway returns `401` due to an expired SIWE message, the CLI refreshes the token and retries.
4. If the gateway returns `402`, the CLI reads `Payment-Required`, creates a payment signature, retries with `Payment-Signature`, then returns the result.

Notes:

- This applies to blockchain query commands like `balance`, `tx`, `rpc`, `nfts`, and `tokens`.
- Admin API commands (`apps`, `chains`) still use access-key auth.
- `PAYMENT_REQUIRED` errors include funding guidance when available.

### 1) Set up a wallet key

Pick one source of truth:

```bash
# Recommended: managed file in config
alchemy wallet generate
# or
alchemy wallet import ./private-key.txt
```

Or provide it directly via env var:

```bash
export ALCHEMY_WALLET_KEY=0x...
```

### 2) Enable x402

Use x402 per command:

```bash
alchemy balance 0x... --x402
```

Or set it as your default behavior:

```bash
alchemy config set x402 true
```

### 3) Fund the wallet (for credits)

x402 requests can require payment. In this flow, your wallet acts as the payment source that funds usage on the Alchemy side.

Recommended approach:

1. Get your wallet address:

```bash
alchemy wallet address
```

2. Send funds to that address on the network/asset required by the x402 gateway (the error details commonly indicate what to use, for example USDC on Base).
3. Retry your command. When payment is required, the CLI signs and submits payment automatically, and that payment is applied to your Alchemy usage credits/charges.

If your balance is too low, you will see `PAYMENT_REQUIRED` with guidance that includes the payer address and required asset/network when available.

How much should you send?

- There is no single fixed amount in this CLI - required payment depends on the request and gateway pricing.
- Rule of thumb: `$1` is about `~20,000 CUs`.
- The most accurate source is the returned `PAYMENT_REQUIRED` error details for your actual request.
- In practice, fund enough to cover your expected usage plus a small buffer to avoid repeated top-ups.
- Check current CU method rates here: https://www.alchemy.com/docs/reference/compute-unit-costs

### 4) Verify your wallet wiring

```bash
alchemy wallet address
alchemy config list
```

You should see a wallet address and (if configured via file) `wallet-key-file`.

### 5) Typical x402 command examples

```bash
alchemy balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --x402
alchemy tx 0xabc123... --x402
alchemy nfts 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 --x402 -n base-mainnet
```

### x402 troubleshooting

- `AUTH_REQUIRED`: wallet key is missing/invalid; verify `wallet-key-file` or `ALCHEMY_WALLET_KEY`.
- `PAYMENT_REQUIRED`: fund the wallet on the required network/asset and retry.
- Prefer one wallet source (`--wallet-key-file`, env var, or config) to avoid confusion.
- Use `--debug` to print additional diagnostics during setup/testing.

## Usage

### Interactive REPL

Run `alchemy` with no arguments in a terminal to enter interactive mode with inline tab-completion and persisted history:

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
alchemy network list --configured
alchemy network list --configured --app-id <app-id>
```

### Manage x402 wallet

```bash
alchemy wallet generate
alchemy wallet import ./my-private-key.txt
alchemy wallet address
```

### Manage configuration

```bash
alchemy config set api-key <key>
alchemy config set access-key <key>
alchemy config set app              # interactive app selector (type-to-filter for large lists)
alchemy config set network polygon-mainnet
alchemy config set verbose true     # default verbose output for supported commands
alchemy config set wallet-key-file ~/.config/alchemy/wallet-key.txt
alchemy config set x402 true        # default blockchain auth uses x402 wallet flow
alchemy config reset                # reset all saved config values
alchemy config reset network        # reset only one key
alchemy config reset --yes          # skip reset confirmation in TTY
alchemy config get x402
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
| `--verbose, -v` | — | Verbose user-facing output (includes raw sections where supported) |
| `--reveal` | — | Show secrets in plain text (TTY only) |
| `--timeout <ms>` | — | Request timeout in milliseconds |
| `--debug` | — | Internal debug diagnostics (`[debug] ...`) |
| `--no-color` | `NO_COLOR` | Disable color output |
| `--x402` | — | Use x402 wallet-based gateway auth |
| `--wallet-key-file <path>` | — | Wallet private key file used for x402 auth |
| — | `ALCHEMY_CONFIG` | Custom path to the config file |
| — | `ALCHEMY_NETWORK` | Default network (same as `--network`) |
| — | `ALCHEMY_WALLET_KEY` | Wallet private key for x402 auth |

## Output Modes

The CLI auto-detects your environment:

- **TTY (interactive terminal):** Human-friendly formatted output
- **Non-TTY (piped/scripted):** JSON output for easy parsing
- **`--json` flag:** Force JSON output regardless of environment
- **`--verbose` flag or `config set verbose true`:** Include richer output in supported commands (for example, a raw section in `block` output)

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

### Run during development

```bash
# Run directly without building
npx tsx src/index.ts balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045

# Or build in watch mode
pnpm dev
```

### Build

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

### Test/debug endpoint overrides

The following env vars are intended for local testing/debugging (for example, mock E2E servers). They are **not** normal production configuration:

- `ALCHEMY_RPC_BASE_URL`
- `ALCHEMY_ADMIN_API_BASE_URL`
- `ALCHEMY_X402_BASE_URL`

Safety constraints:

- Only localhost targets are accepted (`localhost`, `127.0.0.1`, `::1`)
- Non-HTTPS transport is only allowed for localhost targets
- Default production behavior is unchanged when these vars are unset

### Type check

```bash
pnpm lint
```

## Releasing

> **TODO:** Not yet published to npm. Once published, users will install with:
> ```bash
> pnpm add -g @alchemyplatform/cli
> ```
