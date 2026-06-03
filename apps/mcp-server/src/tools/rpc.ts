import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import { classifySolanaDasPaywallError } from "@alchemy/sdk/solana";
import { mcpRpcClient } from "../clients/rpc.js";
import {
  getApiKey,
  toolResult,
  handleToolError,
  formatResult,
  SolanaDasPaywallError,
} from "./helpers.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

function handleSolanaDasToolError(err: unknown) {
  const paywall = classifySolanaDasPaywallError(err);
  if (paywall) {
    return handleToolError(new SolanaDasPaywallError(paywall.message, paywall.hint, paywall.details));
  }
  return handleToolError(err);
}

export function registerRpcTools(server: InstrumentedServer): void {
  // ──────────────────────────────────────────
  // Generic JSON-RPC call
  // ──────────────────────────────────────────

  // ──────────────────────────────────────────
  // Standard Ethereum JSON-RPC Methods
  // ──────────────────────────────────────────

  server.tool(
    "ethGetBalance",
    "Get the ETH (or native token) balance of an address in wei. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      address: z.string().describe("Wallet address"),
      blockNumber: z.string().default("latest").describe("Block number or tag (latest, pending, earliest)"),
    },
    READ_ONLY,
    async ({ network, address, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBalance", [address, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetBlockByNumber",
    "Get a block by its number or tag. Set fullTransactions to true to include full transaction objects. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockNumber: z.string().describe("Block number (hex) or tag (latest, pending, earliest)"),
      fullTransactions: z.boolean().default(false).describe("If true, return full transaction objects instead of just hashes"),
    },
    READ_ONLY,
    async ({ network, blockNumber, fullTransactions }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBlockByNumber", [blockNumber, fullTransactions]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetBlockByHash",
    "Get a block by its hash. Set fullTransactions to true to include full transaction objects. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockHash: z.string().describe("Block hash"),
      fullTransactions: z.boolean().default(false).describe("If true, return full transaction objects instead of just hashes"),
    },
    READ_ONLY,
    async ({ network, blockHash, fullTransactions }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBlockByHash", [blockHash, fullTransactions]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetTransactionByHash",
    "Get a transaction by its hash. Returns transaction details including from, to, value, input data, etc. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      transactionHash: z.string().describe("Transaction hash"),
    },
    READ_ONLY,
    async ({ network, transactionHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getTransactionByHash", [transactionHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetTransactionReceipt",
    "Get the receipt of a transaction by its hash. Includes status, gas used, logs, etc. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      transactionHash: z.string().describe("Transaction hash"),
    },
    READ_ONLY,
    async ({ network, transactionHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getTransactionReceipt", [transactionHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetTransactionCount",
    "Get the number of transactions sent from an address (nonce). Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      address: z.string().describe("Wallet address"),
      blockNumber: z.string().default("latest").describe("Block number or tag"),
    },
    READ_ONLY,
    async ({ network, address, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getTransactionCount", [address, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethBlockNumber",
    "Get the current block number. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_blockNumber", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGasPrice",
    "Get the current gas price in wei. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_gasPrice", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethEstimateGas",
    "Estimate the gas needed for a transaction. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      to: z.string().describe("Destination address"),
      from: z.string().optional().describe("Sender address"),
      value: z.string().optional().describe("Value in wei (hex)"),
      data: z.string().optional().describe("Transaction data (hex)"),
    },
    READ_ONLY,
    async ({ network, to, from, value, data }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { to };
        if (from) { tx.from = from; }
        if (value) { tx.value = value; }
        if (data) { tx.data = data; }
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_estimateGas", [tx]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetCode",
    "Get the bytecode at a contract address. Returns '0x' for non-contract addresses. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      address: z.string().describe("Contract address"),
      blockNumber: z.string().default("latest").describe("Block number or tag"),
    },
    READ_ONLY,
    async ({ network, address, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getCode", [address, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetStorageAt",
    "Get the value of a storage slot at a contract address. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      address: z.string().describe("Contract address"),
      storageSlot: z.string().describe("Storage slot position (hex)"),
      blockNumber: z.string().default("latest").describe("Block number or tag"),
    },
    READ_ONLY,
    async ({ network, address, storageSlot, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getStorageAt", [address, storageSlot, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetLogs",
    "Get event logs matching a filter. Use to query contract events by topic, address, and block range. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      address: z.union([z.string(), z.array(z.string())]).optional().describe("Contract address(es) to filter"),
      topics: z.array(z.union([z.string(), z.array(z.string()), z.null()])).optional().describe("Topic filters (up to 4)"),
      fromBlock: z.string().default("latest").describe("Start block (hex or tag)"),
      toBlock: z.string().default("latest").describe("End block (hex or tag)"),
    },
    READ_ONLY,
    async ({ network, address, topics, fromBlock, toBlock }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const filter: Record<string, unknown> = { fromBlock, toBlock };
        if (address) { filter.address = address; }
        if (topics) { filter.topics = topics; }
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getLogs", [filter]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethChainId",
    "Get the chain ID of the network. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_chainId", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethFeeHistory",
    "Get historical gas fee data. Returns base fees and priority fee percentiles for a range of blocks. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockCount: z.string().describe("Number of blocks to return (hex)"),
      newestBlock: z.string().default("latest").describe("Newest block (hex or tag)"),
      rewardPercentiles: z.array(z.number()).optional().describe("Percentiles to sample priority fees (e.g. [25, 50, 75])"),
    },
    READ_ONLY,
    async ({ network, blockCount, newestBlock, rewardPercentiles }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [blockCount, newestBlock];
        if (rewardPercentiles) { params.push(rewardPercentiles); }
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_feeHistory", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethMaxPriorityFeePerGas",
    "Get the current suggested priority fee (tip) in wei. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_maxPriorityFeePerGas", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ethSendRawTransaction removed — too risky for LLM tool (sends real transactions)

  server.tool(
    "netVersion",
    "Get the current network ID. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "net_version", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "web3ClientVersion",
    "Get the Alchemy node client version. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "web3_clientVersion", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetBlockTransactionCountByHash",
    "Get the number of transactions in a block by block hash. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockHash: z.string().describe("Block hash"),
    },
    READ_ONLY,
    async ({ network, blockHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBlockTransactionCountByHash", [blockHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetBlockTransactionCountByNumber",
    "Get the number of transactions in a block by block number. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockNumber: z.string().describe("Block number (hex) or tag (latest, pending, earliest)"),
    },
    READ_ONLY,
    async ({ network, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBlockTransactionCountByNumber", [blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetTransactionByBlockHashAndIndex",
    "Get a transaction by block hash and index position. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockHash: z.string().describe("Block hash"),
      index: z.string().describe("Transaction index position (hex)"),
    },
    READ_ONLY,
    async ({ network, blockHash, index }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getTransactionByBlockHashAndIndex", [blockHash, index]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetTransactionByBlockNumberAndIndex",
    "Get a transaction by block number and index position. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      blockNumber: z.string().describe("Block number (hex) or tag"),
      index: z.string().describe("Transaction index position (hex)"),
    },
    READ_ONLY,
    async ({ network, blockNumber, index }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getTransactionByBlockNumberAndIndex", [blockNumber, index]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethSyncing",
    "Check if the node is syncing. Returns false if fully synced, or sync status object if syncing. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_syncing", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethCallBundle",
    "Simulate a bundle of transactions at a specific block. Used for MEV bundle simulation. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      transactions: z.array(z.string()).describe("Array of signed transaction data (hex)"),
      blockNumber: z.string().describe("Block number (hex) to simulate against"),
      stateBlockNumber: z.string().optional().describe("Block number (hex) for state context"),
    },
    READ_ONLY,
    async ({ network, transactions, blockNumber, stateBlockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { txs: transactions, blockNumber };
        if (stateBlockNumber) {
          params.stateBlockNumber = stateBlockNumber;
        }
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_callBundle", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethCallMany",
    "Execute multiple eth_call requests in a single batch against optional block state overrides. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      calls: z.array(z.array(z.unknown())).describe("Array of [callObject, blockOverride] pairs"),
      blockNumber: z.string().default("latest").describe("Block number or tag"),
    },
    READ_ONLY,
    async ({ network, calls, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_callMany", [calls, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "netListening",
    "Check if the node is listening for network connections. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "net_listening", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "web3Sha3",
    "Compute the Keccak-256 hash of the given data. Requires select_app first.",
    {
      network: z.string().describe("Network identifier"),
      data: z.string().describe("Data to hash (hex encoded)"),
    },
    READ_ONLY,
    async ({ network, data }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "web3_sha3", [data]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Token API
  // ──────────────────────────────────────────

  server.tool(
    "getTokenBalances",
    "Get ERC-20 token balances for an address. Returns a list of token contract addresses and their balances. Supports Ethereum, Base, Polygon, Arbitrum, Optimism, and 40+ other networks. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      address: z.string().describe("Wallet address to check balances for"),
      contractAddresses: z.array(z.string()).optional().describe("Optional array of specific token contract addresses to check. If omitted, returns all ERC-20 balances."),
      pageKey: z.string().optional().describe("Pagination key from previous response"),
    },
    READ_ONLY,
    async ({ network, address, contractAddresses, pageKey }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = contractAddresses
          ? [address, contractAddresses]
          : [address, "erc20"];
        if (pageKey) {
          params.push({ pageKey });
        }
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_getTokenBalances", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getTokenMetadata",
    "Get metadata (name, symbol, decimals, logo) for an ERC-20 token contract. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("Token contract address"),
    },
    READ_ONLY,
    async ({ network, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_getTokenMetadata", [contractAddress]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getTokenAllowance",
    "Get the ERC-20 token allowance granted by an owner to a spender. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contract: z.string().describe("Token contract address"),
      owner: z.string().describe("Address of the token owner"),
      spender: z.string().describe("Address of the approved spender"),
    },
    READ_ONLY,
    async ({ network, contract, owner, spender }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_getTokenAllowance", [
          { contract, owner, spender },
        ]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Transfers API
  // ──────────────────────────────────────────

  server.tool(
    "getAssetTransfers",
    "Get historical asset transfers (transactions) for an address. Supports ERC-20, ERC-721, ERC-1155, native, and internal transfers. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      fromAddress: z.string().optional().describe("Sender address to filter by"),
      toAddress: z.string().optional().describe("Recipient address to filter by"),
      fromBlock: z.string().optional().default("0x0").describe("Start block (hex string, default '0x0')"),
      toBlock: z.string().optional().default("latest").describe("End block (hex string or 'latest')"),
      category: z.array(z.enum(["external", "internal", "erc20", "erc721", "erc1155", "specialnft"])).describe("Transfer categories to include"),
      contractAddresses: z.array(z.string()).optional().describe("Filter by specific contract addresses"),
      excludeZeroValue: z.boolean().optional().default(true).describe("Exclude zero-value transfers"),
      withMetadata: z.boolean().optional().default(false).describe("Include block timestamps (ETH, Base, Polygon, Arbitrum, Optimism only)"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order by block number"),
      maxCount: z.string().optional().describe("Max results per page (hex string, default '0x3e8' = 1000)"),
      pageKey: z.string().optional().describe("Pagination key from previous response"),
    },
    READ_ONLY,
    async ({ network, fromAddress, toAddress, fromBlock, toBlock, category, contractAddresses, excludeZeroValue, withMetadata, order, maxCount, pageKey }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { category };
        if (fromAddress) params.fromAddress = fromAddress;
        if (toAddress) params.toAddress = toAddress;
        if (fromBlock) params.fromBlock = fromBlock;
        if (toBlock) params.toBlock = toBlock;
        if (contractAddresses) params.contractAddresses = contractAddresses;
        if (excludeZeroValue !== undefined) params.excludeZeroValue = excludeZeroValue;
        if (withMetadata !== undefined) params.withMetadata = withMetadata;
        if (order) params.order = order;
        if (maxCount) params.maxCount = maxCount;
        if (pageKey) params.pageKey = pageKey;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_getAssetTransfers", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Transaction Receipts
  // ──────────────────────────────────────────

  server.tool(
    "getTransactionReceipts",
    "Get all transaction receipts for a given block. Specify either blockNumber or blockHash. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      blockNumber: z.string().optional().describe("Block number as hex string (e.g. '0x10d4f')"),
      blockHash: z.string().optional().describe("Block hash (0x-prefixed)"),
    },
    READ_ONLY,
    async ({ network, blockNumber, blockHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string> = {};
        if (blockNumber) params.blockNumber = blockNumber;
        if (blockHash) params.blockHash = blockHash;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_getTransactionReceipts", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Transaction Simulation
  // ──────────────────────────────────────────

  server.tool(
    "simulateAssetChanges",
    "Simulate a transaction and return the resulting asset changes (token transfers, balance changes). Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, eth-sepolia)"),
      from: z.string().describe("Sender address"),
      to: z.string().describe("Recipient/contract address"),
      value: z.string().optional().describe("ETH value in hex (e.g. '0xde0b6b3a7640000' for 1 ETH)"),
      data: z.string().optional().describe("Calldata (hex-encoded)"),
    },
    READ_ONLY,
    async ({ network, from, to, value, data }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { from, to };
        if (value) tx.value = value;
        if (data) tx.data = data;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_simulateAssetChanges", [tx]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "simulateExecution",
    "Simulate a transaction and return the execution trace with decoded logs and state changes. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, eth-sepolia)"),
      from: z.string().describe("Sender address"),
      to: z.string().describe("Recipient/contract address"),
      value: z.string().optional().describe("ETH value in hex"),
      data: z.string().optional().describe("Calldata (hex-encoded)"),
    },
    READ_ONLY,
    async ({ network, from, to, value, data }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { from, to };
        if (value) tx.value = value;
        if (data) tx.data = data;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_simulateExecution", [tx]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Trace API
  // ──────────────────────────────────────────

  server.tool(
    "traceCall",
    "Trace a call without creating a transaction. Returns detailed execution traces. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      from: z.string().optional().describe("Sender address"),
      to: z.string().describe("Target contract address"),
      value: z.string().optional().describe("ETH value in hex"),
      data: z.string().optional().describe("Calldata (hex-encoded)"),
      traceType: z.array(z.enum(["trace", "vmTrace", "stateDiff"])).default(["trace"]).describe("Trace types to include"),
      blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest'"),
    },
    READ_ONLY,
    async ({ network, from, to, value, data, traceType, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { to };
        if (from) tx.from = from;
        if (value) tx.value = value;
        if (data) tx.data = data;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_call", [tx, traceType, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "traceTransaction",
    "Get the execution trace of an already-mined transaction. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      transactionHash: z.string().describe("Transaction hash (0x-prefixed)"),
    },
    READ_ONLY,
    async ({ network, transactionHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_transaction", [transactionHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "traceBlock",
    "Get execution traces for all transactions in a block. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string (e.g. '0x10d4f')"),
    },
    READ_ONLY,
    async ({ network, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_block", [blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Alchemy Debug API
  // ──────────────────────────────────────────

  server.tool(
    "debugTraceTransaction",
    "Debug trace a transaction with configurable tracer. Returns detailed execution information. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      transactionHash: z.string().describe("Transaction hash (0x-prefixed)"),
      tracer: z.enum(["callTracer", "prestateTracer"]).optional().describe("Tracer type (callTracer or prestateTracer)"),
      timeout: z.string().optional().describe("Tracer timeout (e.g. '10s')"),
    },
    READ_ONLY,
    async ({ network, transactionHash, tracer, timeout }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const opts: Record<string, unknown> = {};
        if (tracer) opts.tracer = tracer;
        if (timeout) opts.timeout = timeout;
        const params: unknown[] = [transactionHash];
        if (Object.keys(opts).length > 0) params.push(opts);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_traceTransaction", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "debugTraceCall",
    "Debug trace a call without creating a transaction. Returns detailed execution information. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      from: z.string().optional().describe("Sender address"),
      to: z.string().describe("Target contract address"),
      value: z.string().optional().describe("ETH value in hex"),
      data: z.string().optional().describe("Calldata (hex-encoded)"),
      tracer: z.enum(["callTracer", "prestateTracer"]).optional().describe("Tracer type"),
      blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest'"),
    },
    READ_ONLY,
    async ({ network, from, to, value, data, tracer, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { to };
        if (from) tx.from = from;
        if (value) tx.value = value;
        if (data) tx.data = data;
        const opts: Record<string, unknown> = {};
        if (tracer) opts.tracer = tracer;
        const params: unknown[] = [tx, blockNumber];
        if (Object.keys(opts).length > 0) params.push(opts);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_traceCall", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // ERC-4337 Bundler API
  // ──────────────────────────────────────────

  // sendUserOperation removed — submits real transactions via bundler

  server.tool(
    "estimateUserOperationGas",
    "Estimate gas limits for an ERC-4337 UserOperation. Returns preVerificationGas, verificationGasLimit, and callGasLimit. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      userOperation: z.record(z.string(), z.unknown()).describe("UserOperation object with sender, nonce, callData, gas limits, fees, and signature fields"),
      entryPoint: z.string().describe("EntryPoint contract address"),
    },
    READ_ONLY,
    async ({ network, userOperation, entryPoint }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "estimateUserOperationGas", [userOperation, entryPoint]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getUserOperationReceipt",
    "Get the receipt of a previously submitted ERC-4337 UserOperation by its hash. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      userOpHash: z.string().describe("UserOperation hash returned from eth_sendUserOperation"),
    },
    READ_ONLY,
    async ({ network, userOpHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getUserOperationReceipt", [userOpHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getUserOperationByHash",
    "Get a UserOperation by its hash. Returns the full UserOperation object with metadata. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      userOpHash: z.string().describe("UserOperation hash"),
    },
    READ_ONLY,
    async ({ network, userOpHash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getUserOperationByHash", [userOpHash]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "supportedEntryPoints",
    "Get the list of EntryPoint addresses supported by the bundler on a given network. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "supportedEntryPoints", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Solana Digital Asset Standard (DAS) API
  // ──────────────────────────────────────────

  server.tool(
    "solana_getAsset",
    "Get details of a Solana digital asset (token, NFT, compressed NFT) by its ID. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      id: z.string().describe("Asset ID (mint address or asset ID)"),
    },
    READ_ONLY,
    async ({ network, id }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAsset", { id });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetsByOwner",
    "Get all digital assets owned by a Solana wallet address. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      ownerAddress: z.string().describe("Solana wallet address"),
      page: z.number().optional().default(1).describe("Page number (default 1)"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, ownerAddress, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { ownerAddress, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetsByOwner", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_searchAssets",
    "Search for Solana digital assets by various criteria. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      ownerAddress: z.string().optional().describe("Filter by owner address"),
      grouping: z.array(z.string()).optional().describe("Group key and value (e.g. ['collection', 'address'])"),
      compressed: z.boolean().optional().describe("Filter compressed assets only"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, ownerAddress, grouping, compressed, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { page };
        if (ownerAddress) params.ownerAddress = ownerAddress;
        if (grouping) params.grouping = grouping;
        if (compressed !== undefined) params.compressed = compressed;
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "searchAssets", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "getTokenAccounts",
    "Get token accounts for a Solana wallet, including balances and token metadata. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      owner: z.string().describe("Solana wallet address"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, owner, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { ownerAddress: owner, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenAccounts", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Additional Solana DAS methods
  // ──────────────────────────────────────────

  server.tool(
    "solana_getAssets",
    "Get details of multiple Solana digital assets by their IDs in a single request. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      ids: z.array(z.string()).describe("Array of asset IDs (mint addresses)"),
    },
    READ_ONLY,
    async ({ network, ids }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssets", { ids });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetProof",
    "Get the Merkle proof for a compressed Solana asset. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      id: z.string().describe("Asset ID"),
    },
    READ_ONLY,
    async ({ network, id }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetProof", { id });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetsByAuthority",
    "Get all Solana digital assets by a given authority address. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      authorityAddress: z.string().describe("Authority address"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, authorityAddress, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { authorityAddress, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetsByAuthority", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetsByGroup",
    "Get all Solana digital assets by a group key and value (e.g. collection). Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      groupKey: z.string().describe("Group key (e.g. 'collection')"),
      groupValue: z.string().describe("Group value (e.g. collection address)"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, groupKey, groupValue, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { groupKey, groupValue, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetsByGroup", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetsByCreator",
    "Get all Solana digital assets created by a given address. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      creatorAddress: z.string().describe("Creator address"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, creatorAddress, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { creatorAddress, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetsByCreator", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAssetSignatures",
    "Get transaction signatures for a Solana digital asset. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      id: z.string().describe("Asset ID"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, id, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { id, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAssetSignatures", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  server.tool(
    "getNftEditions",
    "Get NFT editions for a Solana master edition NFT. Requires select_app first.",
    {
      network: z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network"),
      mint: z.string().describe("Master edition mint address"),
      page: z.number().optional().default(1).describe("Page number"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, mint, page, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { mintAddress: mint, page };
        if (limit) params.limit = limit;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getNftEditions", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleSolanaDasToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Additional Transaction Simulation methods
  // ──────────────────────────────────────────

  server.tool(
    "simulateAssetChangesBundle",
    "Simulate a bundle of transactions and return asset changes for each. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, eth-sepolia)"),
      transactions: z.array(z.object({
        from: z.string().describe("Sender address"),
        to: z.string().describe("Recipient/contract address"),
        value: z.string().optional().describe("ETH value in hex"),
        data: z.string().optional().describe("Calldata (hex-encoded)"),
      })).describe("Array of transactions to simulate as a bundle"),
    },
    READ_ONLY,
    async ({ network, transactions }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_simulateAssetChangesBundle", [transactions]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "simulateExecutionBundle",
    "Simulate a bundle of transactions and return execution traces for each. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, eth-sepolia)"),
      transactions: z.array(z.object({
        from: z.string().describe("Sender address"),
        to: z.string().describe("Recipient/contract address"),
        value: z.string().optional().describe("ETH value in hex"),
        data: z.string().optional().describe("Calldata (hex-encoded)"),
      })).describe("Array of transactions to simulate as a bundle"),
    },
    READ_ONLY,
    async ({ network, transactions }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_simulateExecutionBundle", [transactions]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "simulateUserOperationAssetChanges",
    "Simulate an ERC-4337 UserOperation and return the resulting asset changes. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      userOperation: z.record(z.string(), z.unknown()).describe("UserOperation object (v0.6 or v0.7). Signature can be a dummy value for simulation."),
      entryPoint: z.string().describe("EntryPoint contract address"),
      blockNumber: z.string().optional().describe("Block number for simulation context (hex, defaults to current)"),
    },
    READ_ONLY,
    async ({ network, userOperation, entryPoint, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [userOperation, entryPoint];
        if (blockNumber) params.push(blockNumber);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_simulateUserOperationAssetChanges", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Additional Trace API methods
  // ──────────────────────────────────────────

  server.tool(
    "traceFilter",
    "Get traces matching a filter (by from/to address, block range). Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      fromBlock: z.string().optional().describe("Start block (hex)"),
      toBlock: z.string().optional().describe("End block (hex)"),
      fromAddress: z.array(z.string()).optional().describe("Filter by sender addresses"),
      toAddress: z.array(z.string()).optional().describe("Filter by recipient addresses"),
      after: z.number().optional().describe("Offset for pagination"),
      count: z.number().optional().describe("Number of traces to return"),
    },
    READ_ONLY,
    async ({ network, fromBlock, toBlock, fromAddress, toAddress, after, count }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const filter: Record<string, unknown> = {};
        if (fromBlock) filter.fromBlock = fromBlock;
        if (toBlock) filter.toBlock = toBlock;
        if (fromAddress) filter.fromAddress = fromAddress;
        if (toAddress) filter.toAddress = toAddress;
        if (after !== undefined) filter.after = after;
        if (count !== undefined) filter.count = count;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_filter", [filter]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "traceReplayTransaction",
    "Replay a transaction and return its traces. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      transactionHash: z.string().describe("Transaction hash (0x-prefixed)"),
      traceType: z.array(z.enum(["trace", "vmTrace", "stateDiff"])).default(["trace"]).describe("Trace types to include"),
    },
    READ_ONLY,
    async ({ network, transactionHash, traceType }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_replayTransaction", [transactionHash, traceType]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "traceReplayBlockTransactions",
    "Replay all transactions in a block and return their traces. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string"),
      traceType: z.array(z.enum(["trace", "vmTrace", "stateDiff"])).default(["trace"]).describe("Trace types to include"),
    },
    READ_ONLY,
    async ({ network, blockNumber, traceType }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "trace_replayBlockTransactions", [blockNumber, traceType]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Additional Debug API methods
  // ──────────────────────────────────────────

  server.tool(
    "debugTraceBlockByNumber",
    "Debug trace all transactions in a block by block number. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string"),
      tracer: z.enum(["callTracer", "prestateTracer"]).optional().describe("Tracer type"),
    },
    READ_ONLY,
    async ({ network, blockNumber, tracer }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [blockNumber];
        if (tracer) params.push({ tracer });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_traceBlockByNumber", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "debugTraceBlockByHash",
    "Debug trace all transactions in a block by block hash. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockHash: z.string().describe("Block hash (0x-prefixed)"),
      tracer: z.enum(["callTracer", "prestateTracer"]).optional().describe("Tracer type"),
    },
    READ_ONLY,
    async ({ network, blockHash, tracer }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [blockHash];
        if (tracer) params.push({ tracer });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_traceBlockByHash", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "debugGetRawBlock",
    "Get the raw RLP-encoded block data. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string"),
    },
    READ_ONLY,
    async ({ network, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_getRawBlock", [blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "debugGetRawReceipts",
    "Get raw transaction receipts for a block. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string"),
    },
    READ_ONLY,
    async ({ network, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "debug_getRawReceipts", [blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Gas Manager / Paymaster API
  // ──────────────────────────────────────────

  server.tool(
    "requestGasAndPaymasterAndData",
    "Request gas sponsorship and paymaster data for an ERC-4337 UserOperation. Requires a Gas Manager policy ID. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      policyId: z.string().describe("Gas Manager Policy ID (UUID)"),
      entryPoint: z.string().describe("EntryPoint contract address"),
      dummySignature: z.string().describe("Dummy signature for gas estimation"),
      userOperation: z.record(z.string(), z.unknown()).describe("Partial UserOperation object (v0.6 or v0.7) with sender, nonce, callData, etc."),
      overrides: z.record(z.string(), z.unknown()).optional().describe("Optional overrides: {maxFeePerGas, maxPriorityFeePerGas, callGasLimit, verificationGasLimit, preVerificationGas}"),
    },
    READ_ONLY,
    async ({ network, policyId, entryPoint, dummySignature, userOperation, overrides }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { policyId, entryPoint, dummySignature, userOperation };
        if (overrides) params.overrides = overrides;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_requestGasAndPaymasterAndData", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "requestPaymasterAndData",
    "Request paymaster data for an ERC-4337 UserOperation (without gas estimation). Requires a Gas Manager policy ID. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      policyId: z.string().describe("Gas Manager Policy ID (UUID)"),
      entryPoint: z.string().describe("EntryPoint contract address"),
      userOperation: z.record(z.string(), z.unknown()).describe("Partial UserOperation object (v0.6 or v0.7) with sender, nonce, callData, etc."),
    },
    READ_ONLY,
    async ({ network, policyId, entryPoint, userOperation }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "alchemy_requestPaymasterAndData", [
          { policyId, entryPoint, userOperation },
        ]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Wallet API
  // ──────────────────────────────────────────

  // wallet* tools removed — need active smart wallet sessions, not suitable for LLM tool
  // walletRequestAccount, walletPrepareCalls, walletSendPreparedCalls,
  // walletGetCallsStatus, walletGetCapabilities, walletListAccounts,
  // walletCreateSession, walletGetCrossChainStatus, walletRequestQuote

  /* REMOVED WALLET TOOLS START
    "Get or create a smart account for a signer. Returns the smart account address and info. Requires select_app first.",
    {
      signerAddress: z.string().optional().describe("Signer's Ethereum address"),
      accountAddress: z.string().optional().describe("Existing smart account address (alternative to signerAddress)"),
    },
    READ_ONLY,
    async ({ signerAddress, accountAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = {};
        if (signerAddress) params.signerAddress = signerAddress;
        if (accountAddress) params.accountAddress = accountAddress;
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_requestAccount", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletPrepareCalls",
    "Prepare a user operation for submission. Returns the built user operation and a signature request to sign before calling wallet_sendPreparedCalls. Requires select_app first.",
    {
      from: z.string().describe("Sender smart account address"),
      chainId: z.string().describe("Chain ID as hex string (e.g. '0x1' for Ethereum mainnet)"),
      calls: z.array(z.object({
        to: z.string().describe("Target address"),
        data: z.string().optional().describe("Calldata (hex-encoded)"),
        value: z.string().optional().describe("ETH value in hex"),
      })).describe("Array of calls to execute"),
      capabilities: z.record(z.string(), z.unknown()).optional().describe("Optional capabilities (permissions, paymasterService, atomicBatch)"),
    },
    READ_ONLY,
    async ({ from, chainId, calls, capabilities }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { from, chainId, calls };
        if (capabilities) params.capabilities = capabilities;
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_prepareCalls", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletSendPreparedCalls",
    "Submit a signed user operation prepared by wallet_prepareCalls. Returns a call ID for tracking. Requires select_app first.",
    {
      data: z.array(z.record(z.string(), z.unknown())).describe("Array of signed user operation objects returned from wallet_prepareCalls. Pass through as-is after signing."),
    },
    WRITE,
    async ({ data }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_sendPreparedCalls", [{ type: "array", data }]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletGetCallsStatus",
    "Get the status of calls submitted via wallet_sendPreparedCalls. Requires select_app first.",
    {
      callId: z.string().describe("Call ID returned from wallet_sendPreparedCalls"),
    },
    READ_ONLY,
    async ({ callId }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_getCallsStatus", [callId]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletGetCapabilities",
    "Get the capabilities supported by a smart wallet on specified chains. Requires select_app first.",
    {
      walletAddress: z.string().describe("Smart wallet address"),
      chainIds: z.array(z.string()).optional().describe("Optional array of chain IDs (hex) to query"),
    },
    READ_ONLY,
    async ({ walletAddress, chainIds }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = chainIds ? [walletAddress, chainIds] : [walletAddress];
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_getCapabilities", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletListAccounts",
    "List all smart accounts associated with a signer address. Requires select_app first.",
    {
      signerAddress: z.string().describe("Signer's Ethereum address"),
      limit: z.number().optional().describe("Max results (1-100, default 100)"),
      after: z.string().optional().describe("Pagination cursor from previous response"),
    },
    READ_ONLY,
    async ({ signerAddress, limit, after }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { signerAddress };
        if (limit) params.limit = limit;
        if (after) params.after = after;
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_listAccounts", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletCreateSession",
    "Create a session with scoped permissions for a smart account. Requires select_app first.",
    {
      chainId: z.string().describe("Chain ID as hex string"),
      keyType: z.enum(["secp256k1", "ecdsa", "contract"]).describe("Session key type"),
      keyPublicKey: z.string().describe("Session public key"),
      permissions: z.array(z.record(z.string(), z.unknown())).describe("Array of permission objects, e.g. {type: 'native-token-transfer', allowance: '0x...'}, {type: 'erc20-token-transfer', address: '0x...', allowance: '0x...'}, {type: 'gas-limit', limit: '0x...'}, {type: 'contract-access', address: '0x...'}"),
      expirySec: z.number().optional().describe("Session expiry as Unix timestamp in seconds"),
    },
    WRITE,
    async ({ chainId, keyType, keyPublicKey, permissions, expirySec }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const key = { type: keyType, publicKey: keyPublicKey };
        const params: Record<string, unknown> = { chainId, key, permissions };
        if (expirySec) params.expirySec = expirySec;
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_createSession", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletGetCrossChainStatus",
    "Get the status of a same-chain or cross-chain transaction. Requires select_app first.",
    {
      callId: z.string().describe("Call ID from wallet_sendPreparedCalls"),
    },
    READ_ONLY,
    async ({ callId }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_getCrossChainStatus_v0", [callId]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "walletRequestQuote",
    "Request a swap quote for a token exchange. Requires select_app first.",
    {
      from: z.string().describe("Sender address"),
      chainId: z.string().describe("Chain ID as hex string"),
      fromToken: z.string().describe("Source token contract address"),
      toToken: z.string().describe("Destination token contract address"),
      fromAmount: z.string().describe("Amount of source token in hex (wei)"),
      slippage: z.string().optional().describe("Slippage tolerance as hex"),
    },
    READ_ONLY,
    async ({ from, chainId, fromToken, toToken, fromAmount, slippage }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = { from, chainId, fromToken, toToken, fromAmount };
        if (slippage) params.slippage = slippage;
        const result = await mcpRpcClient.globalRpcCall(apiKey, "wallet_requestQuote_v0", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  REMOVED WALLET TOOLS END */

  // ──────────────────────────────────────────
  // EVM: eth_call (dedicated)
  // ──────────────────────────────────────────

  server.tool(
    "ethCall",
    "Execute a read-only smart contract call (eth_call). Returns the result without creating a transaction. Use for reading contract state, checking balances via contract methods, etc. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      to: z.string().describe("Contract address to call"),
      data: z.string().describe("ABI-encoded function call data (hex-encoded, 0x-prefixed)"),
      from: z.string().optional().describe("Sender address (optional, for msg.sender context)"),
      value: z.string().optional().describe("ETH value in hex (for payable functions)"),
      blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest', 'pending', 'earliest'"),
    },
    READ_ONLY,
    async ({ network, to, data, from, value, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { to, data };
        if (from) tx.from = from;
        if (value) tx.value = value;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_call", [tx, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetBlockReceipts",
    "Get all transaction receipts for a block by block number or tag. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      blockNumber: z.string().describe("Block number as hex string (e.g. '0x10d4f') or 'latest'"),
    },
    READ_ONLY,
    async ({ network, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getBlockReceipts", [blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethGetProof",
    "Get the Merkle proof for an account's storage at a given block. Useful for verifying state without trusting the node. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      address: z.string().describe("Account address (0x-prefixed)"),
      storageKeys: z.array(z.string()).describe("Array of storage slot keys to prove (hex-encoded)"),
      blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest'"),
    },
    READ_ONLY,
    async ({ network, address, storageKeys, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_getProof", [address, storageKeys, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethCreateAccessList",
    "Create an EIP-2930 access list for a transaction, showing which storage slots will be accessed. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      from: z.string().optional().describe("Sender address"),
      to: z.string().describe("Target contract address"),
      data: z.string().optional().describe("Calldata (hex-encoded)"),
      value: z.string().optional().describe("ETH value in hex"),
      blockNumber: z.string().optional().default("latest").describe("Block number (hex) or 'latest'"),
    },
    READ_ONLY,
    async ({ network, from, to, data, value, blockNumber }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const tx: Record<string, string> = { to };
        if (from) tx.from = from;
        if (data) tx.data = data;
        if (value) tx.value = value;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_createAccessList", [tx, blockNumber]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "ethBlobBaseFee",
    "Get the current blob base fee in wei (EIP-4844). Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, eth-sepolia)"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "eth_blobBaseFee", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Bundler: rundler_maxPriorityFeePerGas
  // ──────────────────────────────────────────

  server.tool(
    "rundlerMaxPriorityFeePerGas",
    "Get the max priority fee per gas for the bundler on a given network. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "rundler_maxPriorityFeePerGas", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Solana Standard RPC Methods
  // ──────────────────────────────────────────

  const SOLANA_NET = z.enum(["solana-mainnet", "solana-devnet"]).describe("Solana network");
  const COMMITMENT = z.enum(["processed", "confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)");

  // --- Account & Balance ---

  server.tool(
    "solana_getBalance",
    "Get the SOL balance (in lamports) for a Solana account. Requires select_app first.",
    {
      network: SOLANA_NET,
      pubkey: z.string().describe("Base-58 encoded account address"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, pubkey, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [pubkey];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBalance", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getAccountInfo",
    "Get account data for a Solana account (owner, lamports, data, executable flag). Requires select_app first.",
    {
      network: SOLANA_NET,
      pubkey: z.string().describe("Base-58 encoded account address"),
      encoding: z.enum(["base58", "base64", "base64+zstd", "jsonParsed"]).optional().default("jsonParsed").describe("Data encoding (default: jsonParsed)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, pubkey, encoding, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding };
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getAccountInfo", [pubkey, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getMultipleAccounts",
    "Get account data for multiple Solana accounts in a single request (max 100). Requires select_app first.",
    {
      network: SOLANA_NET,
      pubkeys: z.array(z.string()).max(100).describe("Array of base-58 encoded account addresses (max 100)"),
      encoding: z.enum(["base58", "base64", "base64+zstd", "jsonParsed"]).optional().default("jsonParsed").describe("Data encoding (default: jsonParsed)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, pubkeys, encoding, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding };
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getMultipleAccounts", [pubkeys, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Transactions ---

  server.tool(
    "solana_getTransaction",
    "Get a confirmed transaction by its signature. Requires select_app first.",
    {
      network: SOLANA_NET,
      signature: z.string().describe("Base-58 encoded transaction signature"),
      encoding: z.enum(["json", "jsonParsed", "base64", "base58"]).optional().default("jsonParsed").describe("Response encoding (default: jsonParsed)"),
      commitment: z.enum(["confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)"),
      maxSupportedTransactionVersion: z.number().optional().default(0).describe("Max transaction version to return (default: 0, supports versioned txs)"),
    },
    READ_ONLY,
    async ({ network, signature, encoding, commitment, maxSupportedTransactionVersion }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding, maxSupportedTransactionVersion };
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTransaction", [signature, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSignaturesForAddress",
    "Get transaction signatures for an address, ordered newest first. Requires select_app first.",
    {
      network: SOLANA_NET,
      address: z.string().describe("Base-58 encoded account address"),
      limit: z.number().optional().describe("Max signatures to return (1-1000, default 1000)"),
      before: z.string().optional().describe("Start searching backwards from this signature (exclusive)"),
      until: z.string().optional().describe("Search until this signature (exclusive)"),
      commitment: z.enum(["confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)"),
    },
    READ_ONLY,
    async ({ network, address, limit, before, until, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (limit) config.limit = limit;
        if (before) config.before = before;
        if (until) config.until = until;
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSignaturesForAddress", [address, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSignatureStatuses",
    "Get the statuses of a list of transaction signatures. Requires select_app first.",
    {
      network: SOLANA_NET,
      signatures: z.array(z.string()).max(256).describe("Array of base-58 encoded signatures (max 256)"),
      searchTransactionHistory: z.boolean().optional().describe("Search full ledger history (default: false, only searches recent slots)"),
    },
    READ_ONLY,
    async ({ network, signatures, searchTransactionHistory }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [signatures];
        if (searchTransactionHistory !== undefined) params.push({ searchTransactionHistory });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSignatureStatuses", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_simulateTransaction",
    "Simulate a transaction without submitting it. Returns logs and error info. Requires select_app first.",
    {
      network: SOLANA_NET,
      transaction: z.string().describe("Base-64 encoded serialized transaction"),
      commitment: COMMITMENT,
      sigVerify: z.boolean().optional().describe("Verify signatures (default: false)"),
      replaceRecentBlockhash: z.boolean().optional().describe("Replace blockhash with latest (default: false)"),
    },
    READ_ONLY,
    async ({ network, transaction, commitment, sigVerify, replaceRecentBlockhash }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding: "base64" };
        if (commitment) config.commitment = commitment;
        if (sigVerify !== undefined) config.sigVerify = sigVerify;
        if (replaceRecentBlockhash !== undefined) config.replaceRecentBlockhash = replaceRecentBlockhash;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "simulateTransaction", [transaction, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Token Accounts ---

  server.tool(
    "solana_getTokenAccountBalance",
    "Get the token balance of an SPL Token account. Requires select_app first.",
    {
      network: SOLANA_NET,
      pubkey: z.string().describe("Base-58 encoded SPL Token account address"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, pubkey, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [pubkey];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenAccountBalance", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getTokenAccountsByOwner",
    "Get all SPL Token accounts owned by a wallet. Filter by mint or token program. Requires select_app first.",
    {
      network: SOLANA_NET,
      owner: z.string().describe("Base-58 encoded owner wallet address"),
      mint: z.string().optional().describe("Filter by token mint address (use this OR programId)"),
      programId: z.string().optional().describe("Filter by token program ID (use this OR mint). E.g. 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'"),
      encoding: z.enum(["base64", "jsonParsed"]).optional().default("jsonParsed").describe("Data encoding (default: jsonParsed)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, owner, mint, programId, encoding, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const filter: Record<string, string> = {};
        if (mint) filter.mint = mint;
        else if (programId) filter.programId = programId;
        const config: Record<string, unknown> = { encoding };
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenAccountsByOwner", [owner, filter, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getTokenAccountsByDelegate",
    "Get all SPL Token accounts delegated to an address. Requires select_app first.",
    {
      network: SOLANA_NET,
      delegate: z.string().describe("Base-58 encoded delegate address"),
      mint: z.string().optional().describe("Filter by token mint address (use this OR programId)"),
      programId: z.string().optional().describe("Filter by token program ID (use this OR mint)"),
      encoding: z.enum(["base64", "jsonParsed"]).optional().default("jsonParsed").describe("Data encoding (default: jsonParsed)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, delegate, mint, programId, encoding, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const filter: Record<string, string> = {};
        if (mint) filter.mint = mint;
        else if (programId) filter.programId = programId;
        const config: Record<string, unknown> = { encoding };
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenAccountsByDelegate", [delegate, filter, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getTokenSupply",
    "Get the total supply of an SPL Token mint. Requires select_app first.",
    {
      network: SOLANA_NET,
      mint: z.string().describe("Base-58 encoded token mint address"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, mint, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [mint];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenSupply", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getTokenLargestAccounts",
    "Get the 20 largest holders of an SPL Token. Requires select_app first.",
    {
      network: SOLANA_NET,
      mint: z.string().describe("Base-58 encoded token mint address"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, mint, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [mint];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTokenLargestAccounts", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Block & Slot ---

  server.tool(
    "solana_getBlock",
    "Get a confirmed block by slot number. Requires select_app first.",
    {
      network: SOLANA_NET,
      slot: z.number().describe("Slot number"),
      encoding: z.enum(["json", "jsonParsed", "base64", "base58"]).optional().default("jsonParsed").describe("Transaction encoding (default: jsonParsed)"),
      transactionDetails: z.enum(["full", "accounts", "signatures", "none"]).optional().default("full").describe("Transaction detail level (default: full)"),
      commitment: z.enum(["confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)"),
      maxSupportedTransactionVersion: z.number().optional().default(0).describe("Max transaction version (default: 0)"),
      rewards: z.boolean().optional().describe("Include rewards (default: true)"),
    },
    READ_ONLY,
    async ({ network, slot, encoding, transactionDetails, commitment, maxSupportedTransactionVersion, rewards }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding, transactionDetails, maxSupportedTransactionVersion };
        if (commitment) config.commitment = commitment;
        if (rewards !== undefined) config.rewards = rewards;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlock", [slot, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlockHeight",
    "Get the current block height. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlockHeight", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlockTime",
    "Get the estimated production time (Unix timestamp) of a block. Requires select_app first.",
    {
      network: SOLANA_NET,
      slot: z.number().describe("Slot number"),
    },
    READ_ONLY,
    async ({ network, slot }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlockTime", [slot]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlocks",
    "Get confirmed blocks between two slots. Requires select_app first.",
    {
      network: SOLANA_NET,
      startSlot: z.number().describe("Start slot (inclusive)"),
      endSlot: z.number().optional().describe("End slot (inclusive, max 500k above start)"),
      commitment: z.enum(["confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)"),
    },
    READ_ONLY,
    async ({ network, startSlot, endSlot, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [startSlot];
        if (endSlot !== undefined) params.push(endSlot);
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlocks", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSlot",
    "Get the current slot. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSlot", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getLatestBlockhash",
    "Get the latest blockhash and its last valid block height. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getLatestBlockhash", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_isBlockhashValid",
    "Check whether a blockhash is still valid. Requires select_app first.",
    {
      network: SOLANA_NET,
      blockhash: z.string().describe("Base-58 encoded blockhash to check"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, blockhash, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [blockhash];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "isBlockhashValid", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Program Accounts ---

  server.tool(
    "solana_getProgramAccounts",
    "Get all accounts owned by a program. Supports filters for efficient queries. Requires select_app first.",
    {
      network: SOLANA_NET,
      programId: z.string().describe("Base-58 encoded program ID"),
      encoding: z.enum(["base58", "base64", "base64+zstd", "jsonParsed"]).optional().default("jsonParsed").describe("Data encoding (default: jsonParsed)"),
      filters: z.array(z.record(z.string(), z.unknown())).optional().describe("Array of filter objects: {dataSize: number} or {memcmp: {offset: number, bytes: string}}"),
      withContext: z.boolean().optional().describe("Wrap response in context (default: false)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, programId, encoding, filters, withContext, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = { encoding };
        if (filters) config.filters = filters;
        if (withContext !== undefined) config.withContext = withContext;
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getProgramAccounts", [programId, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Network & Cluster Info ---

  server.tool(
    "solana_getEpochInfo",
    "Get info about the current epoch (slot, block height, epoch number, etc.). Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getEpochInfo", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSupply",
    "Get the total, circulating, and non-circulating SOL supply. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSupply", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getVersion",
    "Get the Solana software version running on the node. Requires select_app first.",
    {
      network: SOLANA_NET,
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getVersion", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getTransactionCount",
    "Get the current transaction count. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getTransactionCount", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getInflationRate",
    "Get the current inflation rate. Requires select_app first.",
    {
      network: SOLANA_NET,
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getInflationRate", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getInflationReward",
    "Get inflation rewards for a list of addresses for an epoch. Requires select_app first.",
    {
      network: SOLANA_NET,
      addresses: z.array(z.string()).describe("Array of base-58 encoded validator/staker addresses"),
      epoch: z.number().optional().describe("Epoch number (defaults to previous epoch)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, addresses, epoch, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (epoch !== undefined) config.epoch = epoch;
        if (commitment) config.commitment = commitment;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getInflationReward", [addresses, config]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getVoteAccounts",
    "Get current and delinquent validator vote accounts. Requires select_app first.",
    {
      network: SOLANA_NET,
      votePubkey: z.string().optional().describe("Filter by specific validator vote address"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, votePubkey, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (votePubkey) config.votePubkey = votePubkey;
        if (commitment) config.commitment = commitment;
        const params: unknown[] = Object.keys(config).length > 0 ? [config] : [];
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getVoteAccounts", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getLargestAccounts",
    "Get the 20 largest accounts by lamport balance. Requires select_app first.",
    {
      network: SOLANA_NET,
      filter: z.enum(["circulating", "nonCirculating"]).optional().describe("Filter by circulation status"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, filter, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (filter) config.filter = filter;
        if (commitment) config.commitment = commitment;
        const params: unknown[] = Object.keys(config).length > 0 ? [config] : [];
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getLargestAccounts", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Fees ---

  server.tool(
    "solana_getFeeForMessage",
    "Get the fee for a given serialized message. Requires select_app first.",
    {
      network: SOLANA_NET,
      message: z.string().describe("Base-64 encoded transaction message"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, message, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [message];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getFeeForMessage", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getRecentPrioritizationFees",
    "Get recent prioritization fees to help estimate fees for transactions. Requires select_app first.",
    {
      network: SOLANA_NET,
      addresses: z.array(z.string()).max(128).optional().describe("Accounts to check fees for (max 128). Returns fees relevant to these accounts."),
    },
    READ_ONLY,
    async ({ network, addresses }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = addresses ? [addresses] : [];
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getRecentPrioritizationFees", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getMinimumBalanceForRentExemption",
    "Get the minimum SOL balance (in lamports) needed to make an account rent-exempt. Requires select_app first.",
    {
      network: SOLANA_NET,
      dataLength: z.number().describe("Account data length in bytes"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, dataLength, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [dataLength];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getMinimumBalanceForRentExemption", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // --- Alchemy Enhanced (Solana) ---

  server.tool(
    "solana_getPriorityFeeEstimate",
    "Alchemy-enhanced: Get priority fee estimates for a transaction. Requires select_app first.",
    {
      network: SOLANA_NET,
      transaction: z.string().optional().describe("Base-58 encoded serialized transaction"),
      accountKeys: z.array(z.string()).optional().describe("Account keys to estimate fees for (alternative to transaction)"),
      options: z.record(z.string(), z.unknown()).optional().describe("Options: {includeAllPriorityFeeLevels?: boolean, priorityLevel?: 'min'|'low'|'medium'|'high'|'veryHigh'|'unsafeMax'}"),
    },
    READ_ONLY,
    async ({ network, transaction, accountKeys, options }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, unknown> = {};
        if (transaction) params.transaction = transaction;
        if (accountKeys) params.accountKeys = accountKeys;
        if (options) params.options = options;
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getPriorityFeeEstimate", [params]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Solana: Remaining Standard RPC Methods
  // ──────────────────────────────────────────

  server.tool(
    "solana_getClusterNodes",
    "Get info about all nodes in the Solana cluster. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getClusterNodes", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getLeaderSchedule",
    "Get the leader schedule for an epoch. Requires select_app first.",
    {
      network: SOLANA_NET,
      slot: z.number().optional().describe("Slot to get epoch leader schedule for (defaults to current epoch)"),
      identity: z.string().optional().describe("Filter by validator identity (base-58)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, slot, identity, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (identity) config.identity = identity;
        if (commitment) config.commitment = commitment;
        const params: unknown[] = slot !== undefined ? [slot] : [null];
        if (Object.keys(config).length > 0) params.push(config);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getLeaderSchedule", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getMaxRetransmitSlot",
    "Get the max slot seen from the retransmit stage. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getMaxRetransmitSlot", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getMaxShredInsertSlot",
    "Get the max slot seen from the shred insert stage. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getMaxShredInsertSlot", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getRecentPerformanceSamples",
    "Get recent performance samples (TPS, slots per second). Requires select_app first.",
    {
      network: SOLANA_NET,
      limit: z.number().optional().describe("Max samples to return (max 720, default 720)"),
    },
    READ_ONLY,
    async ({ network, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = limit !== undefined ? [limit] : [];
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getRecentPerformanceSamples", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getFirstAvailableBlock",
    "Get the slot of the lowest confirmed block not yet purged from the ledger. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getFirstAvailableBlock", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getGenesisHash",
    "Get the genesis hash of the Solana cluster. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getGenesisHash", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getHighestSnapshotSlot",
    "Get the highest full and incremental snapshot slots. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getHighestSnapshotSlot", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getIdentity",
    "Get the identity pubkey of the current node. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getIdentity", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getInflationGovernor",
    "Get the current inflation governor parameters. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getInflationGovernor", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_minimumLedgerSlot",
    "Get the lowest slot the node has info about in its ledger. Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "minimumLedgerSlot", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_requestAirdrop",
    "Request an airdrop of SOL to an address (devnet/testnet only). Requires select_app first.",
    {
      network: z.enum(["solana-devnet"]).describe("Solana devnet only"),
      pubkey: z.string().describe("Base-58 encoded recipient address"),
      lamports: z.number().describe("Amount of lamports to airdrop"),
      commitment: COMMITMENT,
    },
    WRITE,
    async ({ network, pubkey, lamports, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [pubkey, lamports];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "requestAirdrop", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlockCommitment",
    "Get the commitment (vote) status for a specific block. Requires select_app first.",
    {
      network: SOLANA_NET,
      slot: z.number().describe("Slot number"),
    },
    READ_ONLY,
    async ({ network, slot }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlockCommitment", [slot]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlockProduction",
    "Get block production stats for validators. Requires select_app first.",
    {
      network: SOLANA_NET,
      identity: z.string().optional().describe("Filter by validator identity (base-58)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, identity, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (identity) config.identity = identity;
        if (commitment) config.commitment = commitment;
        const params: unknown[] = Object.keys(config).length > 0 ? [config] : [];
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlockProduction", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSlotLeader",
    "Get the current slot leader. Requires select_app first.",
    {
      network: SOLANA_NET,
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSlotLeader", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getSlotLeaders",
    "Get the slot leaders for a range of slots. Requires select_app first.",
    {
      network: SOLANA_NET,
      startSlot: z.number().describe("Start slot"),
      limit: z.number().describe("Number of leaders to return (1-5000)"),
    },
    READ_ONLY,
    async ({ network, startSlot, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getSlotLeaders", [startSlot, limit]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getEpochSchedule",
    "Get the epoch schedule (slots per epoch, warmup info). Requires select_app first.",
    { network: SOLANA_NET },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getEpochSchedule", []);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getBlocksWithLimit",
    "Get a list of confirmed blocks starting from a slot, with a max count. Requires select_app first.",
    {
      network: SOLANA_NET,
      startSlot: z.number().describe("Start slot (inclusive)"),
      limit: z.number().describe("Max number of blocks to return"),
      commitment: z.enum(["confirmed", "finalized"]).optional().describe("Commitment level (default: finalized)"),
    },
    READ_ONLY,
    async ({ network, startSlot, limit, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: unknown[] = [startSlot, limit];
        if (commitment) params.push({ commitment });
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getBlocksWithLimit", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_getStakeActivation",
    "Get stake activation state for a stake account. Deprecated — may be removed in solana-core v2.0. Requires select_app first.",
    {
      network: SOLANA_NET,
      pubkey: z.string().describe("Base-58 encoded stake account address"),
      epoch: z.number().optional().describe("Epoch to query (defaults to current)"),
      commitment: COMMITMENT,
    },
    READ_ONLY,
    async ({ network, pubkey, epoch, commitment }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const config: Record<string, unknown> = {};
        if (epoch !== undefined) config.epoch = epoch;
        if (commitment) config.commitment = commitment;
        const params: unknown[] = [pubkey];
        if (Object.keys(config).length > 0) params.push(config);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "getStakeActivation", params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "solana_simulateBundle",
    "Alchemy-enhanced: Simulate a bundle of transactions. Requires select_app first.",
    {
      network: SOLANA_NET,
      transactions: z.array(z.string()).describe("Array of base-64 encoded serialized transactions"),
    },
    READ_ONLY,
    async ({ network, transactions }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpRpcClient.networkRpcCall(network, apiKey, "simulateBundle", [{ encodedTransactions: transactions }]);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
