# Alchemy CLI

Alchemy CLI is a command-line tool for querying blockchain data and managing Alchemy apps/configuration.
It supports both human-friendly terminal output and JSON output for automation.
You can use browser login, API keys, or x402 wallet auth depending on the command.

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

If you use Notify webhooks, add webhook auth on top via `alchemy config set webhook-api-key <key>`, `--webhook-api-key` on `alchemy webhook` commands, or `ALCHEMY_WEBHOOK_API_KEY`.

### Usage By Workflow

After auth is configured, use the CLI differently depending on who is driving it:

- **Humans (interactive terminal):** start with `alchemy` and use the terminal UI/setup flow; this is the recommended path for human usage
- **Agents/scripts (automation):** use `--json --no-interactive` to guarantee JSON output and disable prompts (JSON is auto-enabled when piped, but `--json` is a safe default)

Quick usage examples:

```bash
# Human recommended entrypoint
alchemy

# Agent/script-friendly command
alchemy evm data balance 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 -n eth-mainnet --json --no-interactive

# Agent checks whether a newer CLI version is available
alchemy update-check --json --no-interactive
```

#### Agent bootstrap

Have your agent run `agent-prompt` as its first step to get a complete, machine-readable contract describing every command, auth method, error code, and execution rule:

```bash
# Agent runs this once to learn everything the CLI can do
alchemy --json --no-interactive agent-prompt
```

This returns a single JSON document with execution policy, runtime discovery instructions, preflight instructions, auth matrix, the full command tree with all arguments and options, error codes with recovery actions, and example invocations. No external docs required.

Agents can also call `alchemy --json --no-interactive update-check` to retrieve the current CLI version, latest known version, and install command for upgrades.

## Command Reference

Run commands as `alchemy <command>`.
Use `alchemy help` or `alchemy help <command>` for generated command help.

### EVM

| Command | What it does | Example |
|---|---|---|
| `evm rpc <method> [params...]` | Makes raw Ethereum JSON-RPC calls | `alchemy evm rpc eth_blockNumber -n eth-mainnet` |
| `evm data balance [address]` | Gets native token balance for an address | `alchemy evm data balance 0x... -n eth-mainnet` |
| `evm data tokens balances [address]` | Lists ERC-20 balances for an address | `alchemy evm data tokens balances 0x... -n eth-mainnet` |
| `evm data nfts [address]` | Lists NFTs owned by an address | `alchemy evm data nfts 0x... -n eth-mainnet` |
| `evm data history [address]` | Gets transfer history (`alchemy_getAssetTransfers`) | `alchemy evm data history 0x... --category erc20,erc721 -n eth-mainnet` |
| `evm data price symbol <symbols>` | Gets current token prices by symbol | `alchemy evm data price symbol ETH,USDC` |
| `evm data portfolio tokens --body <json>` | Gets token portfolio data | `alchemy evm data portfolio tokens --body '{...}'` |
| `evm send <to> <amount>` | Sends native tokens for `--network`, or ERC-20 tokens with `--token` | `alchemy evm send vitalik.eth 0.1 -n base-mainnet` |
| `evm contract read/call` | Reads or writes smart contracts | `alchemy evm contract read 0x... "balanceOf(address)(uint256)" --args '["0x..."]' -n eth-mainnet` |
| `evm swap quote/execute` | Swaps tokens on the same chain | `alchemy evm swap quote --from 0xEeee... --to 0xA0b8... --amount 1 -n eth-mainnet` |
| `evm approve <spender_address>` | Approves an ERC-20 token allowance | `alchemy evm approve 0x... --token-address 0x... --amount 10 -n eth-mainnet` |
| `evm status [id]` | Checks transaction or operation status | `alchemy evm status 0x... -n eth-mainnet` |
| `evm network list` | Lists RPC network IDs for use with `--network` | `alchemy evm network list --search base` |
| `evm tx/receipt/block/gas/logs` | Fetches common node resources | `alchemy evm block latest -n eth-mainnet` |
| `evm trace/debug` | Calls Trace and Debug API methods | `alchemy evm trace call '{"to":"0x..."}' '["trace"]' latest -n eth-mainnet` |
| `evm simulate *` | Calls simulation APIs | `alchemy evm simulate execution --tx '{"to":"0x..."}' -n eth-mainnet` |

### Wallets

`alchemy wallet` exposes a unified onchain-actions surface. The **session wallet** (Alchemy/Privy-managed, P-256 delegated signer) is the recommended flow; a **local wallet** (private key stored on disk) is supported as an alternative.

| Command | What it does | Example |
|---|---|---|
| `wallet connect` | Interactive: choose a session wallet (recommended) or a local wallet. For scripts, pass `--mode <session\|local>`. | `alchemy wallet connect` |
| `wallet connect --mode local --chain evm` | Create a new local EVM key (non-interactive). `--chain` accepts `evm`, `solana`, or `both`. | `alchemy wallet connect --mode local --chain both` |
| `wallet connect --mode local --import <path>` | Import an existing EVM private key from a file. | `alchemy wallet connect --mode local --import ./key.txt` |
| `wallet connect --mode session --instance-name <name>` | Connect a named session wallet instance. | `alchemy wallet connect --mode session --instance-name laptop` |
| `wallet status [--verify]` | Reports session, local EVM, local Solana, and the active signer. `--verify` reconciles the session with the backend. | `alchemy wallet status --verify` |
| `wallet address` | Prints addresses for every configured signer. | `alchemy wallet address` |
| `wallet use <session\|local>` | Selects which signer `evm send`, `evm swap`, `evm approve`, `xchain bridge`, and `evm contract call` use for EVM transactions. | `alchemy wallet use local` |
| `wallet disconnect` | Revokes the current session (local + backend). Clears `active_signer` if it pointed at the session. | `alchemy wallet disconnect` |
| `wallet qr [--type <evm\|solana>]` | Renders a configured address as a QR code. | `alchemy wallet qr --type evm` |

Per-command override: pass `--signer <session\|local>` to `evm send`, `evm approve`, `evm swap`, `xchain bridge`, or `evm contract call` to override the active signer for a single invocation.

### Chains

| Command | What it does | Example |
|---|---|---|
| `solana rpc <method> [params...]` | Calls Solana JSON-RPC methods | `alchemy solana rpc getBalance '"<pubkey>"' -n solana-mainnet` |
| `solana das <method> [params...]` | Calls Solana DAS methods | `alchemy solana das getAssetsByOwner '{"ownerAddress":"<pubkey>"}' -n solana-mainnet` |
| `solana network list` | Lists networks from the Solana namespace | `alchemy solana network list --search solana` |
| `solana send <to> <amount>` | Sends SOL or SPL tokens to an address | `alchemy solana send <pubkey> 0.1 -n solana-mainnet` |
| `solana send <to> <amount> --token <mint>` | Sends an SPL token and creates the recipient ATA if needed | `alchemy solana send <pubkey> 10 --token <mint> -n solana-mainnet` |
| `solana program accounts/account/show` | Inspects Solana program accounts and account metadata | `alchemy solana program accounts <program-id> -n solana-mainnet` |
| `solana delegate approve/revoke` | Approves or revokes SPL token delegates | `alchemy solana delegate approve --token-account <addr> --mint <mint> --delegate <addr> --amount 1 --decimals 6 -n solana-mainnet` |
| `solana status [id]` | Checks Solana transaction or operation status | `alchemy solana status <signature> -n solana-mainnet` |
| `xchain bridge quote/execute` | Bridges tokens across chains | `alchemy xchain bridge quote --from 0xEeee... --to 0xEeee... --amount 0.1 --to-network base-mainnet -n eth-mainnet` |

### CLI Admin

| Command | What it does | Example |
|---|---|---|
| `(no command)` | Starts interactive REPL mode (TTY only) | `alchemy` |
| `auth` (`auth login`) | Log in via browser (PKCE) | `alchemy auth` |
| `auth status` | Show current authentication status | `alchemy auth status` |
| `auth logout` | Clear saved authentication token | `alchemy auth logout` |
| `app list` | Lists apps (supports pagination/filtering) | `alchemy app list --all` |
| `app chains` | Lists Admin API chain identifiers (e.g. `ETH_MAINNET`) | `alchemy app chains` |
| `app get <id>` | Gets app details | `alchemy app get <app-id>` |
| `app create` | Creates app | `alchemy app create --name "My App" --networks eth-mainnet` |
| `app update <id>` | Updates app name/description | `alchemy app update <app-id> --name "New Name"` |
| `app delete <id>` | Deletes app | `alchemy app delete <app-id>` |
| `app networks <id>` | Updates app network allowlist | `alchemy app networks <app-id> --networks eth-mainnet,polygon-mainnet` |
| `app address-allowlist <id>` | Updates app address allowlist | `alchemy app address-allowlist <app-id> --addresses 0xabc,0xdef` |
| `app origin-allowlist <id>` | Updates app origin allowlist | `alchemy app origin-allowlist <app-id> --origins https://example.com` |
| `app ip-allowlist <id>` | Updates app IP allowlist | `alchemy app ip-allowlist <app-id> --ips 1.2.3.4,5.6.7.8` |
| `app configured-networks` | Lists RPC network slugs configured for an app | `alchemy app configured-networks --app-id <app-id>` |
| `app select [id]` | Selects the default app interactively or by ID | `alchemy app select <app-id>` |
| `webhook list` | Lists Notify webhooks | `alchemy webhook list --webhook-api-key <key>` |
| `webhook create --body <json>` | Creates Notify webhook | `alchemy webhook create --body '{...}' --webhook-api-key <key>` |
| `webhook update --body <json>` | Updates Notify webhook | `alchemy webhook update --body '{...}' --webhook-api-key <key>` |
| `webhook delete <id>` | Deletes Notify webhook | `alchemy webhook delete <id> --webhook-api-key <key>` |
| `webhook addresses <id>` | Gets address activity webhook addresses | `alchemy webhook addresses <id> --webhook-api-key <key>` |
| `webhook nft-filters <id>` | Gets NFT activity webhook filters | `alchemy webhook nft-filters <id> --webhook-api-key <key>` |
| `doctor` | Runs readiness checks and suggestions | `alchemy doctor` |
| `install mcp` | Installs Alchemy's remote MCP server config | `alchemy install mcp --client claude --dry-run` |
| `install skills` | Installs bundled Alchemy skills | `alchemy install skills --client cursor --dry-run` |
| `update-check` | Checks whether a newer CLI version is available | `alchemy update-check --json --no-interactive` |
| `config set ...` | Sets config values | `alchemy config set app <app-id>` |
| `config get <key>` | Gets one config value | `alchemy config get verbose` |
| `config list` | Lists all config values | `alchemy config list` |
| `config reset [key]` | Resets one or all config values | `alchemy config reset --yes` |
| `completions <shell>` | Generates shell completion scripts (bash/zsh/fish) | `eval "$(alchemy completions zsh)"` |
| `agent-prompt` | Emits complete agent/automation usage instructions | `alchemy --json --no-interactive agent-prompt` |
| `version` | Prints CLI version | `alchemy version` |

## Flags

### Global flags

These apply to all commands.

#### Auth & network

| Flag | Env var | Description |
|---|---|---|
| `--api-key <key>` | `ALCHEMY_API_KEY` | API key for blockchain query commands |
| `-n, --network <network>` | — | Target network for networked commands |
| `--x402` | — | Enable x402 wallet-based gateway auth |
| `--wallet-key-file <path>` | — | EVM wallet private key file for x402 auth and local signing |
| `--solana-wallet-key-file <path>` | — | Solana wallet private key file for local signing |

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
| `ALCHEMY_WALLET_KEY` | EVM wallet private key for x402 auth and local signing |
| `ALCHEMY_SOLANA_WALLET_KEY` | Solana wallet private key |
| `ALCHEMY_ACTIVE_SIGNER` | Active EVM signer override (`session` or `local`) |
| `ALCHEMY_EVM_GAS_SPONSORED` | Enable EVM gas sponsorship when set to `true` |
| `ALCHEMY_EVM_GAS_POLICY_ID` | EVM gas sponsorship policy ID |
| `ALCHEMY_SOLANA_FEE_SPONSORED` | Enable Solana fee sponsorship when set to `true` |
| `ALCHEMY_SOLANA_FEE_POLICY_ID` | Solana fee sponsorship policy ID |
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
| `evm send` | `-n, --network <network>` (required), `--token <address>`, `--gas-sponsored`, `--gas-policy-id <id>`, `--signer <session\|local>` |
| `evm contract call` | `--args <json>`, `--abi-file <path>`, `--abi <json>`, `--value <ether>`, `--gas-sponsored`, `--gas-policy-id <id>`, `--signer <session\|local>` |
| `evm swap quote` | `--from <token_address>`, `--to <token_address>`, `--amount <number>`, `--slippage <percent>`, `--signer <session\|local>` |
| `evm swap execute` | `--from <token_address>`, `--to <token_address>`, `--amount <number>`, `--slippage <percent>`, `--gas-sponsored`, `--gas-policy-id <id>`, `--signer <session\|local>` |
| `evm approve` | `--token-address <token_address>`, `--amount <decimal_amount>`, `--unlimited`, `--revoke`, `--reset-first`, `-y, --yes`, `--gas-sponsored`, `--gas-policy-id <id>`, `--signer <session\|local>` |
| `xchain bridge quote` | `--from <token_address>`, `--to <token_address>`, `--amount <number>`, `--to-network <network>`, `--slippage <percent>`, `--signer <session\|local>` |
| `xchain bridge execute` | `--from <token_address>`, `--to <token_address>`, `--amount <number>`, `--to-network <network>`, `--slippage <percent>`, `--gas-sponsored`, `--gas-policy-id <id>`, `--signer <session\|local>` |
| `wallet connect` | `--mode <session\|local>`, `--chain <evm\|solana\|both>`, `--import <path>`, `--instance-name <name>`, `--force` |
| `wallet status` | `--verify` |
| `wallet qr` | `--type <evm\|solana>`, `--solana` |
| `solana send` | `--token <mint>`, `--dry-run`, `--fail-if-associated-token-account-missing`, `--from-token-account <address>`, `--recipient-token-account <address>`, `--fee-sponsored`, `--fee-policy-id <id>`, `--signer <session\|local>` |
| `solana program accounts` | `--filters <json>`, `--encoding <encoding>`, `--limit <n>` |
| `solana delegate approve` | `--token-account <address>`, `--mint <address>`, `--delegate <address>`, `--amount <number>`, `--decimals <n>`, `--fee-sponsored`, `--fee-policy-id <id>` |
| `solana delegate revoke` | `--token-account <address>`, `--fee-sponsored`, `--fee-policy-id <id>` |
| `webhook *` | `--webhook-api-key <key>` (or `ALCHEMY_WEBHOOK_API_KEY`, `ALCHEMY_NOTIFY_AUTH_TOKEN`, config `webhook-api-key`, or app webhook key) |
| `app list` | `--cursor <cursor>`, `--limit <n>`, `--all`, `--search <query>`, `--id <appId>` |
| `app create` | `--name <name>` (required), `--networks <networks>` (required), `--description <desc>`, `--products <products>`, `--dry-run` |
| `app update` | `--name <name>`, `--description <desc>`, `--dry-run` |
| `app delete` | `--dry-run`, `-y, --yes` |
| `app networks` | `--networks <networks>` (required), `--dry-run` |
| `app address-allowlist` | `--addresses <addrs>` (required), `--dry-run` |
| `app origin-allowlist` | `--origins <origins>` (required), `--dry-run` |
| `app ip-allowlist` | `--ips <ips>` (required), `--dry-run` |
| `app configured-networks` | `--app-id <id>` |
| `install mcp` | `--client <claude,cursor,codex,other,all>`, `--dry-run` |
| `install skills` | `--client <claude,cursor,codex,all>`, `--dry-run` |
| `evm network list` | `--mainnet-only`, `--testnet-only`, `--search <term>` |
| `config set` | `webhook-api-key`, `app`, `network`, `verbose`, `wallet-key-file`, `x402`, `evm-gas-sponsored`, `evm-gas-policy-id`, `solana-fee-sponsored`, `solana-fee-policy-id` |
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
    "message": "Not authenticated. Run 'alchemy auth' to log in, or set ALCHEMY_API_KEY.",
    "hint": "alchemy auth"
  }
}
```
