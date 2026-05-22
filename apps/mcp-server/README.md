# Alchemy MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes Alchemy's blockchain APIs as tools for LLM agents. Supports 70+ networks across EVM chains and Solana with **159 dedicated tools**.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  MCP Client │────▶│  MCP Server  │────▶│  Alchemy APIs       │
│  (Claude,   │     │  (Express +  │     │  - Node Gateway     │
│   Cursor)   │     │   Streamable │     │  - NFT API          │
│             │◀────│   HTTP)      │◀────│  - Prices API       │
└─────────────┘     └──────────────┘     │  - Portfolio API    │
                           │             │  - Admin API        │
                           ▼             └─────────────────────┘
                    ┌──────────────┐
                    │    Redis     │
                    │  (auth +     │
                    │   API key    │
                    │   cache)     │
                    └──────────────┘
```

## Resources

Read-only MCP resources expose Alchemy's supported network catalog:

| Resource | Description |
|----------|-------------|
| `alchemy://networks` | All blockchain networks supported by Alchemy |
| `alchemy://networks/evm` | EVM networks supported by Alchemy |
| `alchemy://networks/solana` | Solana networks supported by Alchemy |
| `alchemy://networks/{networkId}` | Metadata for a specific Alchemy network |

## Tool Groups (159 tools)

Tools are organized into three groups:

### Admin — Account & App Management (8 tools)

Tools for managing your Alchemy account, apps, and infrastructure. These do **not** interact with the blockchain.

| Tool | Description |
|------|-------------|
| `ping` | Health check |
| `list_apps` | List your Alchemy apps |
| `get_app` | Get app details (masked API key, networks, allowlists) |
| `select_app` | Select an app and cache its API key for RPC/Data tools |
| `create_app` | Create a new app |
| `update_app` | Update app name or description |
| `list_chains` | List all supported networks |
| `update_allowlist` | Replace app allowlists (network, address, origin, IP) |

### RPC — On-Chain JSON-RPC (123 tools)

Tools that make JSON-RPC calls to blockchain nodes. All require `select_app` first.

#### Core EVM RPC

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `ethCall` | `eth_call` | Execute a read-only smart contract call |
| `ethGetBlockReceipts` | `eth_getBlockReceipts` | Get all receipts for a block |
| `ethGetProof` | `eth_getProof` | Get Merkle proof for account storage |
| `ethCreateAccessList` | `eth_createAccessList` | Generate EIP-2930 access list |
| `ethBlobBaseFee` | `eth_blobBaseFee` | Get EIP-4844 blob base fee |

#### Token API

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `getTokenBalances` | `alchemy_getTokenBalances` | Get ERC-20 token balances for an address |
| `getTokenMetadata` | `alchemy_getTokenMetadata` | Get token name, symbol, decimals, logo |
| `getTokenAllowance` | `alchemy_getTokenAllowance` | Get ERC-20 allowance for a spender |

#### Transfers API

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `getAssetTransfers` | `alchemy_getAssetTransfers` | Get historical asset transfers (ERC-20, ERC-721, native, internal) |

#### Transaction Receipts

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `getTransactionReceipts` | `alchemy_getTransactionReceipts` | Get all transaction receipts for a block |

#### Transaction Simulation

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `simulateAssetChanges` | `alchemy_simulateAssetChanges` | Simulate a transaction's asset changes |
| `simulateExecution` | `alchemy_simulateExecution` | Simulate a transaction's execution trace |
| `simulateAssetChangesBundle` | `alchemy_simulateAssetChangesBundle` | Simulate a bundle of transactions' asset changes |
| `simulateExecutionBundle` | `alchemy_simulateExecutionBundle` | Simulate a bundle of transactions' execution traces |
| `simulateUserOperationAssetChanges` | `alchemy_simulateUserOperationAssetChanges` | Simulate a UserOperation's asset changes |

#### Trace API

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `traceCall` | `trace_call` | Trace a call without creating a transaction |
| `traceTransaction` | `trace_transaction` | Trace a mined transaction |
| `traceBlock` | `trace_block` | Trace all transactions in a block |
| `traceFilter` | `trace_filter` | Filter traces by address and block range |
| `traceReplayTransaction` | `trace_replayTransaction` | Replay a transaction with traces |
| `traceReplayBlockTransactions` | `trace_replayBlockTransactions` | Replay all transactions in a block |

#### Debug API

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `debugTraceTransaction` | `debug_traceTransaction` | Debug trace a transaction |
| `debugTraceCall` | `debug_traceCall` | Debug trace a call |
| `debugTraceBlockByNumber` | `debug_traceBlockByNumber` | Debug trace a block by number |
| `debugTraceBlockByHash` | `debug_traceBlockByHash` | Debug trace a block by hash |
| `debugGetRawBlock` | `debug_getRawBlock` | Get raw RLP-encoded block data |
| `debugGetRawReceipts` | `debug_getRawReceipts` | Get raw transaction receipts for a block |

#### ERC-4337 Bundler

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `estimateUserOperationGas` | `eth_estimateUserOperationGas` | Estimate gas for a UserOperation |
| `getUserOperationReceipt` | `eth_getUserOperationReceipt` | Get a UserOperation receipt |
| `getUserOperationByHash` | `eth_getUserOperationByHash` | Get a UserOperation by hash |
| `supportedEntryPoints` | `eth_supportedEntryPoints` | List supported EntryPoint addresses |
| `rundlerMaxPriorityFeePerGas` | `rundler_maxPriorityFeePerGas` | Get bundler's max priority fee per gas |

#### Gas Manager / Paymaster

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `requestGasAndPaymasterAndData` | `alchemy_requestGasAndPaymasterAndData` | Request gas sponsorship + paymaster data |
| `requestPaymasterAndData` | `alchemy_requestPaymasterAndData` | Request paymaster data only |

#### Solana Standard RPC

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `solana_getBalance` | `getBalance` | Get SOL balance in lamports |
| `solana_getAccountInfo` | `getAccountInfo` | Get account data (owner, lamports, data) |
| `solana_getMultipleAccounts` | `getMultipleAccounts` | Get data for multiple accounts (max 100) |
| `solana_getTransaction` | `getTransaction` | Get a confirmed transaction by signature |
| `solana_getSignaturesForAddress` | `getSignaturesForAddress` | Get transaction signatures for an address |
| `solana_getSignatureStatuses` | `getSignatureStatuses` | Get statuses of transaction signatures |
| `solana_simulateTransaction` | `simulateTransaction` | Simulate a transaction without submitting |
| `solana_getTokenAccountBalance` | `getTokenAccountBalance` | Get SPL Token account balance |
| `solana_getTokenAccountsByOwner` | `getTokenAccountsByOwner` | Get all token accounts for a wallet |
| `solana_getTokenAccountsByDelegate` | `getTokenAccountsByDelegate` | Get delegated token accounts |
| `solana_getTokenSupply` | `getTokenSupply` | Get total supply of an SPL Token |
| `solana_getTokenLargestAccounts` | `getTokenLargestAccounts` | Get top 20 holders of a token |
| `solana_getBlock` | `getBlock` | Get a confirmed block by slot |
| `solana_getBlockHeight` | `getBlockHeight` | Get current block height |
| `solana_getBlockTime` | `getBlockTime` | Get Unix timestamp for a slot |
| `solana_getBlocks` | `getBlocks` | Get confirmed blocks in a range |
| `solana_getBlocksWithLimit` | `getBlocksWithLimit` | Get confirmed blocks from a slot with limit |
| `solana_getBlockCommitment` | `getBlockCommitment` | Get vote commitment for a block |
| `solana_getBlockProduction` | `getBlockProduction` | Get block production stats |
| `solana_getSlot` | `getSlot` | Get current slot |
| `solana_getSlotLeader` | `getSlotLeader` | Get current slot leader |
| `solana_getSlotLeaders` | `getSlotLeaders` | Get slot leaders for a range |
| `solana_getLatestBlockhash` | `getLatestBlockhash` | Get latest blockhash |
| `solana_isBlockhashValid` | `isBlockhashValid` | Check blockhash validity |
| `solana_getProgramAccounts` | `getProgramAccounts` | Get all accounts owned by a program |
| `solana_getEpochInfo` | `getEpochInfo` | Get current epoch info |
| `solana_getEpochSchedule` | `getEpochSchedule` | Get epoch schedule |
| `solana_getSupply` | `getSupply` | Get SOL supply breakdown |
| `solana_getVersion` | `getVersion` | Get node software version |
| `solana_getTransactionCount` | `getTransactionCount` | Get total transaction count |
| `solana_getInflationRate` | `getInflationRate` | Get current inflation rate |
| `solana_getInflationGovernor` | `getInflationGovernor` | Get inflation governor parameters |
| `solana_getInflationReward` | `getInflationReward` | Get staking rewards by epoch |
| `solana_getVoteAccounts` | `getVoteAccounts` | Get validator vote accounts |
| `solana_getLargestAccounts` | `getLargestAccounts` | Get top 20 accounts by balance |
| `solana_getClusterNodes` | `getClusterNodes` | Get cluster node info |
| `solana_getLeaderSchedule` | `getLeaderSchedule` | Get leader schedule for an epoch |
| `solana_getFeeForMessage` | `getFeeForMessage` | Get fee for a message |
| `solana_getRecentPrioritizationFees` | `getRecentPrioritizationFees` | Get recent priority fee data |
| `solana_getMinimumBalanceForRentExemption` | `getMinimumBalanceForRentExemption` | Get rent-exempt minimum |
| `solana_getFirstAvailableBlock` | `getFirstAvailableBlock` | Get lowest available block |
| `solana_getGenesisHash` | `getGenesisHash` | Get genesis hash |
| `solana_getHighestSnapshotSlot` | `getHighestSnapshotSlot` | Get highest snapshot slot |
| `solana_getIdentity` | `getIdentity` | Get node identity pubkey |
| `solana_getMaxRetransmitSlot` | `getMaxRetransmitSlot` | Get max retransmit slot |
| `solana_getMaxShredInsertSlot` | `getMaxShredInsertSlot` | Get max shred insert slot |
| `solana_getRecentPerformanceSamples` | `getRecentPerformanceSamples` | Get recent TPS samples |
| `solana_getStakeActivation` | `getStakeActivation` | Get stake activation state (deprecated) |
| `solana_minimumLedgerSlot` | `minimumLedgerSlot` | Get lowest ledger slot |
| `solana_requestAirdrop` | `requestAirdrop` | Airdrop SOL (devnet only) |

#### Solana Alchemy-Enhanced

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `solana_getPriorityFeeEstimate` | `getPriorityFeeEstimate` | Get priority fee estimates by level |
| `solana_simulateBundle` | `simulateBundle` | Simulate a bundle of transactions |

#### Solana Digital Asset Standard (DAS)

| Tool | JSON-RPC Method | Description |
|------|----------------|-------------|
| `solana_getAsset` | `getAsset` | Get details of a Solana asset |
| `solana_getAssets` | `getAssets` | Get multiple Solana assets |
| `solana_getAssetProof` | `getAssetProof` | Get Merkle proof for a compressed asset |
| `solana_getAssetsByOwner` | `getAssetsByOwner` | Get assets owned by a wallet |
| `solana_getAssetsByAuthority` | `getAssetsByAuthority` | Get assets by authority address |
| `solana_getAssetsByGroup` | `getAssetsByGroup` | Get assets by group (e.g. collection) |
| `solana_getAssetsByCreator` | `getAssetsByCreator` | Get assets by creator address |
| `solana_searchAssets` | `searchAssets` | Search for assets by criteria |
| `solana_getAssetSignatures` | `getAssetSignatures` | Get transaction signatures for an asset |
| `getNftEditions` | `getNftEditions` | Get NFT editions for a master edition |
| `getTokenAccounts` | `getTokenAccounts` | Get token accounts for a wallet |

### Data — On-Chain REST APIs (28 tools)

Tools that call Alchemy's REST APIs for enriched blockchain data. All require `select_app` first.

#### NFT API

| Tool | Endpoint | Description |
|------|----------|-------------|
| `getNFTsForOwner` | `GET /getNFTsForOwner` | Get all NFTs owned by an address |
| `getNFTsForContract` | `GET /getNFTsForContract` | Get all NFTs in a contract |
| `getNFTsForCollection` | `GET /getNFTsForCollection` | Get all NFTs in a collection |
| `getNFTMetadata` | `GET /getNFTMetadata` | Get NFT metadata by token ID |
| `getNFTMetadataBatch` | `POST /getNFTMetadataBatch` | Get metadata for up to 100 NFTs |
| `getContractMetadata` | `GET /getContractMetadata` | Get NFT contract metadata |
| `getCollectionMetadata` | `GET /getCollectionMetadata` | Get collection metadata by slug |
| `getContractMetadataBatch` | `POST /getContractMetadataBatch` | Get metadata for multiple contracts |
| `getOwnersForNFT` | `GET /getOwnersForNFT` | Get owners of a specific NFT |
| `getOwnersForContract` | `GET /getOwnersForContract` | Get all owners in a contract |
| `getFloorPrice` | `GET /getFloorPrice` | Get floor price from marketplaces |
| `getNFTSales` | `GET /getNFTSales` | Get recent NFT sales |
| `getContractsForOwner` | `GET /getContractsForOwner` | Get NFT contracts held by an address |
| `getCollectionsForOwner` | `GET /getCollectionsForOwner` | Get collections held by an address (ETH only) |
| `isSpamContract` | `GET /isSpamContract` | Check if a contract is spam |
| `getSpamContracts` | `GET /getSpamContracts` | List all spam contracts |
| `isAirdropNFT` | `GET /isAirdropNFT` | Check if an NFT is an airdrop |
| `searchContractMetadata` | `GET /searchContractMetadata` | Search NFT contracts by keyword |
| `summarizeNFTAttributes` | `GET /summarizeNFTAttributes` | Get attribute prevalence summary |
| `isHolderOfContract` | `GET /isHolderOfContract` | Check if a wallet holds any NFT from a contract |
| `computeRarity` | `GET /computeRarity` | Calculate attribute rarity for an NFT |

#### Prices API

| Tool | Endpoint | Description |
|------|----------|-------------|
| `getTokenPricesBySymbol` | `GET /tokens/by-symbol` | Get token prices by symbol (ETH, BTC, etc.) |
| `getTokenPricesByAddress` | `POST /tokens/by-address` | Get token prices by contract address |
| `getHistoricalTokenPrices` | `POST /tokens/historical` | Get historical price data over a time range |

#### Portfolio / Multi-Chain Data API

| Tool | Endpoint | Description |
|------|----------|-------------|
| `getTokensByAddress` | `POST /assets/tokens/by-address` | Get tokens across multiple chains |
| `getTokenBalancesByAddress` | `POST /assets/tokens/balances/by-address` | Get token balances with USD values across chains |
| `getNFTsByAddress` | `POST /assets/nfts/by-address` | Get NFTs across multiple chains |
| `getNFTContractsByAddress` | `POST /assets/nfts/contracts/by-address` | Get NFT contracts across multiple chains |

## Typical Workflow

```
1. Authenticate via OAuth (Bearer token)
2. list_apps → find your app
3. select_app → cache the API key
4. Use RPC or Data tools
```

## Development

```bash
pnpm install
pnpm --filter @alchemy/mcp-server dev     # Start with hot reload (tsx watch)
pnpm --filter @alchemy/mcp-server build   # Compile TypeScript
pnpm --filter @alchemy/mcp-server start   # Run compiled server
```

### Local Dev with Tilt

[Tilt](https://docs.tilt.dev/install.html) manages Redis, the MCP server, and smoke tests. Requires Docker, AWS CLI with SSO configured, and `jq`.

```bash
# Start against staging (default)
tilt up

# Start against production
tilt up -- --env prod
```

This will:
1. Prompt AWS SSO login if your session is expired
2. Fetch the `SHARED_SECRET` from AWS Secrets Manager (`staging/authchemy` or `production/authchemy`)
3. Start a local Redis container
4. Run the MCP server on `http://localhost:3000` with all external services pointing to the selected environment

The Tilt dashboard is at http://localhost:10350.

### Smoke Tests

The smoke test suite covers infrastructure endpoints, admin tools, EVM RPC, Solana, NFT/token APIs, and multi-chain support. If no auth token is provided, it opens your browser for OAuth login automatically.

```bash
# Via Tilt (with server already running)
tilt trigger smoke-test

# Standalone against local server
./scripts/smoke-test.sh http://localhost:3000

# Against staging or production directly
./scripts/smoke-test.sh https://mcp.alchemypreview.com
./scripts/smoke-test.sh https://mcp.alchemy.com

# With a pre-existing auth token
./scripts/smoke-test.sh http://localhost:3000 <AUTH_TOKEN>
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ALCHEMY_BASE_DOMAIN` | `alchemy.com` | Base domain for all Alchemy APIs |
| `MCP_AUTH_SERVER_URL` | `https://auth.{domain}` | OAuth authorization server |
| `MCP_RESOURCE_URL` | `https://mcp.{domain}/mcp` | MCP resource endpoint |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `REDIS_TLS` | `false` | Enable TLS for Redis |

## Project Structure

```
src/
├── index.ts              # Express app, endpoints, startup
├── server.ts             # MCP server factory
├── auth.ts               # OAuth Bearer token validation
├── redis.ts              # Redis client
├── clients/
│   ├── admin.ts          # Admin API client
│   ├── rpc.ts            # JSON-RPC client (network + global gateway)
│   └── data.ts           # REST API client (NFT, Prices, Portfolio)
└── tools/
    ├── index.ts           # Central tool registration
    ├── helpers.ts         # Auth, API key retrieval, error handling
    ├── system.ts          # Admin: health check
    ├── apps.ts            # Admin: app CRUD
    ├── chains.ts          # Admin: network listing
    ├── allowlists.ts      # Admin: allowlist management
    ├── rpc.ts             # On-chain: JSON-RPC tools (123 tools)
    └── data.ts            # On-chain: REST API tools (28 tools)
```
