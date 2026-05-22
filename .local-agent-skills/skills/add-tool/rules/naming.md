# Tool Naming Conventions

## Format

```
alchemy_{category}_{methodName}
```

## Categories

| Prefix                | Used for             | Examples                                                             |
| --------------------- | -------------------- | -------------------------------------------------------------------- |
| `alchemy_rpc_`        | EVM JSON-RPC methods | `alchemy_rpc_call`, `alchemy_rpc_ethCall`                            |
| `alchemy_rpc_`        | EVM enhanced methods | `alchemy_rpc_getTokenBalances`, `alchemy_rpc_simulateAssetChanges`   |
| `alchemy_rpc_`        | Trace/Debug methods  | `alchemy_rpc_traceCall`, `alchemy_rpc_debugTraceTransaction`         |
| `alchemy_rpc_`        | Bundler/Paymaster    | `alchemy_rpc_sendUserOperation`, `alchemy_rpc_supportedEntryPoints`  |
| `alchemy_rpc_`        | Wallet API           | `alchemy_rpc_walletRequestAccount`, `alchemy_rpc_walletPrepareCalls` |
| `alchemy_rpc_solana_` | Solana standard RPC  | `alchemy_rpc_solana_getBalance`, `alchemy_rpc_solana_getTransaction` |
| `alchemy_rpc_`        | Solana DAS           | `alchemy_rpc_getAsset`, `alchemy_rpc_getAssetsByOwner`               |
| `alchemy_data_`       | NFT REST API         | `alchemy_data_getNFTsForOwner`, `alchemy_data_getFloorPrice`         |
| `alchemy_data_`       | Prices REST API      | `alchemy_data_getTokenPricesBySymbol`                                |
| `alchemy_data_`       | Portfolio REST API   | `alchemy_data_getNFTsByAddress`, `alchemy_data_getTokensByAddress`   |

## Method Name Casing

- Use camelCase matching the Alchemy API method name
- EVM: `ethCall`, `getTokenBalances`, `simulateAssetChanges`
- Solana: `getBalance`, `getTransaction`, `getTokenAccountsByOwner`
- Data: `getNFTsForOwner`, `getTokenPricesBySymbol`

## Do NOT

- Abbreviate method names (use `getTransaction` not `getTx`)
- Add redundant prefixes (it's `alchemy_rpc_solana_getBalance` not `alchemy_rpc_solana_solanaGetBalance`)
- Use underscores in method names (use `getBlockHeight` not `get_block_height`)
