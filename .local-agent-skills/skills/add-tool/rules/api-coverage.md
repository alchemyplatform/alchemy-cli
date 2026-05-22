# API Coverage

Every documented Alchemy API method MUST have a dedicated MCP tool. No exceptions.

## The Rule

If an API method appears in the Alchemy documentation at https://www.alchemy.com/docs, it needs a 1:1 dedicated tool in this MCP server. The generic `alchemy_rpc_call` exists as a fallback for undocumented or experimental methods — it is NOT a substitute for proper tool coverage.

## Before Adding Tools

1. Check the Alchemy docs for the complete list of methods in the relevant category
2. Cross-reference against existing tools in `src/tools/rpc.ts` and `src/tools/data.ts`
3. Identify any gaps — documented methods without dedicated tools
4. Add ALL missing tools, not just the one requested

## API Documentation Reference

The canonical source of truth for what APIs exist is:

- **Alchemy docs:** https://www.alchemy.com/docs
- **Internal docs repo:** /Users/chris.lee/Development/alchemy/alchemyplatform/docs (if available)

### Categories to check

| Category               | Doc path                    | MCP file            |
| ---------------------- | --------------------------- | ------------------- |
| EVM JSON-RPC           | Ethereum RPC reference      | `src/tools/rpc.ts`  |
| Debug API              | Debug namespace reference   | `src/tools/rpc.ts`  |
| Trace API              | Trace namespace reference   | `src/tools/rpc.ts`  |
| Alchemy Enhanced (EVM) | Alchemy namespace reference | `src/tools/rpc.ts`  |
| ERC-4337 Bundler       | Bundler API reference       | `src/tools/rpc.ts`  |
| Wallet API             | Smart Wallet reference      | `src/tools/rpc.ts`  |
| Simulation             | Simulation reference        | `src/tools/rpc.ts`  |
| Solana Standard RPC    | Solana API overview         | `src/tools/rpc.ts`  |
| Solana DAS             | Solana DAS reference        | `src/tools/rpc.ts`  |
| NFT API                | NFT API reference           | `src/tools/data.ts` |
| Token API              | Token API reference         | `src/tools/rpc.ts`  |
| Prices API             | Prices reference            | `src/tools/data.ts` |
| Transfers API          | Transfers reference         | `src/tools/rpc.ts`  |
| Portfolio API          | Multi-chain Data reference  | `src/tools/data.ts` |

## After Adding Tools

1. Run `npm run build` to verify compilation
2. Test each new tool with a real API call via the MCP client
3. Verify the response contains expected data
