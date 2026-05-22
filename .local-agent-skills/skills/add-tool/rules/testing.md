# Testing Tools

Every new tool must be verified before considering it done.

## Steps

### 1. Build

```bash
npm run build
```

Must compile with zero errors.

### 2. Live Test via MCP Client

After rebuilding the MCP server and reconnecting (`/plugin`):

1. Select an app: `alchemy_select_app`
2. Call the new tool with real parameters
3. Verify the response contains expected data

### 3. Test Data to Use

| Chain      | Test Data                                                   |
| ---------- | ----------------------------------------------------------- |
| **EVM**    | Vitalik: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`       |
| **EVM**    | USDC contract: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| **EVM**    | BAYC contract: `0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D` |
| **EVM**    | Early block: `0x10d4f`                                      |
| **Solana** | Test wallet: `vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg`  |
| **Solana** | USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`   |
| **Solana** | Wrapped SOL: `So11111111111111111111111111111111111111112`  |

### 4. Expected Error Handling

These errors are OK and do NOT indicate code bugs:

- `403` — Network not enabled on the selected app
- `503` / `-32001` — Transient node-side errors
- `-32601 Method not found` — DAS methods on staging gateway (not available on `alchemypreview.com`)
- `-32010` — Node secondary index limitations (e.g. `getTokenLargestAccounts` for popular mints)

These errors DO indicate code bugs:

- `400` — Wrong request body format, missing required fields
- `-32602` — Missing required parameters
- Schema validation errors from Zod
- `fetch failed` — Wrong URL construction

### 5. Batch Testing

When adding multiple tools, test them in parallel using concurrent MCP calls to save time. Group by category (e.g. all Solana block tools together, all token tools together).
