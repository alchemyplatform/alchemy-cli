# Tool Structure

Every MCP tool MUST follow this structure. No exceptions.

## Required Elements

### 1. Zod Schema (typed parameters)

Every parameter must have a Zod type and `.describe()` annotation. Never use `z.unknown()` or `z.any()` for top-level params.

```typescript
{
  network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
  address: z.string().describe("Wallet address (0x-prefixed for EVM, base-58 for Solana)"),
  blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest'"),
}
```

### 2. Dedicated Handler

Every tool gets its own `server.tool()` call with a dedicated async handler. Never make the user go through `rpc_call` for a documented API method.

### 3. Hint Flags

Use the predefined constants:

- `READ_ONLY` for queries: `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }`
- `WRITE` for state-changing operations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }`

### 4. Error Handling

Always wrap in try/catch using the standard pattern:

```typescript
async (params, { authInfo }) => {
  try {
    const apiKey = await getApiKey(authInfo);
    // ... build params and call API
    return toolResult(formatResult(result));
  } catch (err) {
    return handleToolError(err);
  }
};
```

### 5. Description

- First sentence: what the tool does
- End with: "Requires alchemy_select_app first."
- Keep it concise — LLMs use this to decide which tool to call

## File Organization

| Category                                           | File                                              | Client                                            |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| EVM RPC, Trace, Debug, Bundler, Wallet, Simulation | `src/tools/rpc.ts`                                | `rpcCall()` or `rpcCallGlobal()`                  |
| Solana Standard RPC                                | `src/tools/rpc.ts`                                | `rpcCall()` with `solana-mainnet`/`solana-devnet` |
| Solana DAS                                         | `src/tools/rpc.ts`                                | `rpcCall()`                                       |
| NFT API                                            | `src/tools/data.ts`                               | `dataGet()` / `dataPost()` via `nftBaseUrl()`     |
| Prices API                                         | `src/tools/data.ts`                               | `dataGet()` / `dataPost()` via `pricesBaseUrl()`  |
| Portfolio/Multi-chain API                          | `src/tools/data.ts`                               | `dataPost()` via `portfolioBaseUrl()`             |
| Admin (apps, chains, allowlists)                   | `src/tools/apps.ts`, `chains.ts`, `allowlists.ts` | `adminRequest()`                                  |

## EVM vs Solana Patterns

### EVM RPC tools

- Addresses: hex `0x`-prefixed
- Block references: hex strings (`"0x10d4f"`) or `"latest"`
- Amounts: hex wei strings
- Client: `rpcCall(network, apiKey, method, params)`

### Solana RPC tools

- Use shared constants: `SOLANA_NET` for network enum, `COMMITMENT` for commitment levels
- Addresses: base-58 encoded
- Block references: slot numbers (integers)
- Amounts: lamports (integers)
- Config objects go as the last param element
- Client: same `rpcCall(network, apiKey, method, params)`

### Data API tools (NFT, Prices, Portfolio)

- GET endpoints: `dataGet(baseUrl, apiKey, path, params)`
- POST endpoints: `dataPost(baseUrl, apiKey, path, body)`
- Portfolio endpoints: body format is `{ addresses: [{ address, networks? }] }`
- Array query params use `"paramName[]"` key format
