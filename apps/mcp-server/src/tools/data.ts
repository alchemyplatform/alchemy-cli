import type { InstrumentedServer } from "../server.js";
import { z } from "zod";
import {
  limitPortfolioPayload,
  normalizePortfolioOutput,
} from "@alchemy/sdk/data";
import { mcpDataClient } from "../clients/data.js";
import { getApiKey, toolResult, handleToolError, formatResult } from "./helpers.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const PORTFOLIO_LIMIT = z.number().int().positive().optional().describe("Optionally limit arrays in the formatted response");

export function registerDataTools(server: InstrumentedServer): void {
  // ──────────────────────────────────────────
  // NFT API
  // ──────────────────────────────────────────

  server.tool(
    "getNFTsForOwner",
    "Get all NFTs owned by an address. Supports Ethereum, Base, Polygon, Arbitrum, Optimism, and 60+ other networks. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet, polygon-mainnet)"),
      owner: z.string().describe("Wallet address to get NFTs for"),
      contractAddresses: z.array(z.string()).optional().describe("Filter by specific NFT contract addresses"),
      excludeFilters: z.array(z.enum(["SPAM", "AIRDROPS"])).optional().describe("Exclude spam or airdrop NFTs"),
      includeFilters: z.array(z.enum(["SPAM", "AIRDROPS"])).optional().describe("Only include spam or airdrop NFTs"),
      withMetadata: z.boolean().optional().default(true).describe("Include NFT metadata (default true)"),
      orderBy: z.string().optional().describe("Order results (e.g. 'transferTime')"),
      pageKey: z.string().optional().describe("Pagination key from previous response"),
      pageSize: z.number().optional().describe("Results per page (max 100)"),
    },
    READ_ONLY,
    async ({ network, owner, contractAddresses, excludeFilters, includeFilters, withMetadata, orderBy, pageKey, pageSize }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | string[] | undefined> = {
          owner,
          withMetadata: String(withMetadata),
        };
        if (contractAddresses) params["contractAddresses[]"] = contractAddresses;
        if (excludeFilters) params["excludeFilters[]"] = excludeFilters;
        if (includeFilters) params["includeFilters[]"] = includeFilters;
        if (orderBy) params.orderBy = orderBy;
        if (pageKey) params.pageKey = pageKey;
        if (pageSize) params.pageSize = String(pageSize);
        const result = await mcpDataClient.create(apiKey).nft.getNFTsForOwner(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTsForContract",
    "Get all NFTs in a specific contract/collection. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      withMetadata: z.boolean().optional().default(true).describe("Include NFT metadata"),
      startToken: z.string().optional().describe("Token ID to start from for pagination"),
      limit: z.number().optional().describe("Results per page (max 100)"),
    },
    READ_ONLY,
    async ({ network, contractAddress, withMetadata, startToken, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | undefined> = {
          contractAddress,
          withMetadata: String(withMetadata),
        };
        if (startToken) params.startToken = startToken;
        if (limit) params.limit = String(limit);
        const result = await mcpDataClient.create(apiKey).nft.getNFTsForContract(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTMetadata",
    "Get metadata for a specific NFT by contract address and token ID. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      tokenId: z.string().describe("Token ID"),
      tokenType: z.enum(["ERC721", "ERC1155"]).optional().describe("Token type hint"),
      refreshCache: z.boolean().optional().describe("Force refresh cached metadata"),
    },
    READ_ONLY,
    async ({ network, contractAddress, tokenId, tokenType, refreshCache }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | undefined> = { contractAddress, tokenId };
        if (tokenType) params.tokenType = tokenType;
        if (refreshCache) params.refreshCache = String(refreshCache);
        const result = await mcpDataClient.create(apiKey).nft.getNFTMetadata(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTMetadataBatch",
    "Get metadata for up to 100 NFTs in a single request. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      tokens: z.array(z.object({
        contractAddress: z.string().describe("NFT contract address"),
        tokenId: z.string().describe("Token ID"),
        tokenType: z.enum(["ERC721", "ERC1155"]).optional().describe("Token type hint"),
      })).describe("Array of NFTs to fetch metadata for (max 100)"),
      refreshCache: z.boolean().optional().describe("Force refresh cached metadata"),
    },
    READ_ONLY,
    async ({ network, tokens, refreshCache }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const body: Record<string, unknown> = { tokens };
        if (refreshCache) body.refreshCache = refreshCache;
        const result = await mcpDataClient.create(apiKey).nft.getNFTMetadataBatch(network, body);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getContractMetadata",
    "Get high-level metadata for an NFT contract (name, symbol, total supply, etc.). Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
    },
    READ_ONLY,
    async ({ network, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getContractMetadata(network, { contractAddress });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getOwnersForNFT",
    "Get all owners of a specific NFT (by contract address and token ID). Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      tokenId: z.string().describe("Token ID"),
    },
    READ_ONLY,
    async ({ network, contractAddress, tokenId }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getOwnersForNFT(network, { contractAddress, tokenId });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getOwnersForContract",
    "Get all owners of NFTs in a contract, with optional token balance information. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      withTokenBalances: z.boolean().optional().describe("Include per-token balance info"),
      pageKey: z.string().optional().describe("Pagination key"),
    },
    READ_ONLY,
    async ({ network, contractAddress, withTokenBalances, pageKey }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | undefined> = { contractAddress };
        if (withTokenBalances) params.withTokenBalances = String(withTokenBalances);
        if (pageKey) params.pageKey = pageKey;
        const result = await mcpDataClient.create(apiKey).nft.getOwnersForContract(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getFloorPrice",
    "Get the floor price of an NFT collection from major marketplaces. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
    },
    READ_ONLY,
    async ({ network, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getFloorPrice(network, { contractAddress });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "isSpamContract",
    "Check if an NFT contract is classified as spam. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().describe("NFT contract address to check"),
    },
    READ_ONLY,
    async ({ network, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.isSpamContract(network, { contractAddress });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "searchContractMetadata",
    "Search for NFT contracts by name or keyword. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      query: z.string().describe("Search query (contract name or keyword)"),
    },
    READ_ONLY,
    async ({ network, query }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.searchContractMetadata(network, { query });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTSales",
    "Get recent sales for an NFT contract or specific token. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      tokenId: z.string().optional().describe("Specific token ID to filter by"),
      order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      pageKey: z.string().optional().describe("Pagination key"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, contractAddress, tokenId, order, pageKey, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | undefined> = { contractAddress };
        if (tokenId) params.tokenId = tokenId;
        if (order) params.order = order;
        if (pageKey) params.pageKey = pageKey;
        if (limit) params.limit = String(limit);
        const result = await mcpDataClient.create(apiKey).nft.getNFTSales(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getContractsForOwner",
    "Get all NFT contracts owned by an address, with optional metadata. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      owner: z.string().describe("Wallet address"),
      excludeFilters: z.array(z.enum(["SPAM", "AIRDROPS"])).optional().describe("Exclude spam or airdrop contracts"),
      pageKey: z.string().optional().describe("Pagination key"),
      pageSize: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, owner, excludeFilters, pageKey, pageSize }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | string[] | undefined> = { owner };
        if (excludeFilters) params["excludeFilters[]"] = excludeFilters;
        if (pageKey) params.pageKey = pageKey;
        if (pageSize) params.pageSize = String(pageSize);
        const result = await mcpDataClient.create(apiKey).nft.getContractsForOwner(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // refreshNftMetadata removed — write operation, not suitable for LLM tool

  server.tool(
    "getNFTsForCollection",
    "Get all NFTs in a collection by contract address or collection slug. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddress: z.string().optional().describe("NFT contract address"),
      collectionSlug: z.string().optional().describe("Collection slug (alternative to contractAddress)"),
      withMetadata: z.boolean().optional().default(true).describe("Include NFT metadata"),
      startToken: z.string().optional().describe("Token ID to start from for pagination"),
      limit: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, contractAddress, collectionSlug, withMetadata, startToken, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | undefined> = {
          withMetadata: String(withMetadata),
        };
        if (contractAddress) params.contractAddress = contractAddress;
        if (collectionSlug) params.collectionSlug = collectionSlug;
        if (startToken) params.startToken = startToken;
        if (limit) params.limit = String(limit);
        const result = await mcpDataClient.create(apiKey).nft.getNFTsForCollection(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getCollectionMetadata",
    "Get high-level metadata for an NFT collection by its slug. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet)"),
      collectionSlug: z.string().describe("Collection slug (e.g. 'boredapeyachtclub')"),
    },
    READ_ONLY,
    async ({ network, collectionSlug }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getCollectionMetadata(network, { collectionSlug });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getContractMetadataBatch",
    "Get metadata for multiple NFT contracts in a single request. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      contractAddresses: z.array(z.string()).describe("Array of NFT contract addresses"),
    },
    READ_ONLY,
    async ({ network, contractAddresses }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getContractMetadataBatch(network, { contractAddresses });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // invalidateContract removed — write operation, not suitable for LLM tool

  server.tool(
    "getSpamContracts",
    "Get a list of all NFT contracts marked as spam by Alchemy. Paid tier only. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, polygon-mainnet)"),
    },
    READ_ONLY,
    async ({ network }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.getSpamContracts(network);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "isAirdropNFT",
    "Check if a specific NFT was received as an airdrop (minted by a different address). Available on Ethereum and Polygon mainnet. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, polygon-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      tokenId: z.string().describe("Token ID"),
    },
    READ_ONLY,
    async ({ network, contractAddress, tokenId }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.isAirdropNFT(network, { contractAddress, tokenId });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "summarizeNFTAttributes",
    "Get a summary of attribute prevalence for an NFT collection. Available on Ethereum and Polygon mainnet. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, polygon-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
    },
    READ_ONLY,
    async ({ network, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.summarizeNFTAttributes(network, { contractAddress });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "isHolderOfContract",
    "Check if a wallet holds any NFT from a specific contract. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, base-mainnet)"),
      wallet: z.string().describe("Wallet address to check"),
      contractAddress: z.string().describe("NFT contract address"),
    },
    READ_ONLY,
    async ({ network, wallet, contractAddress }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.isHolderOfContract(network, { wallet, contractAddress });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "computeRarity",
    "Calculate the rarity of each attribute for a specific NFT. Available on Ethereum and Polygon mainnet. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (e.g. eth-mainnet, polygon-mainnet)"),
      contractAddress: z.string().describe("NFT contract address"),
      tokenId: z.string().describe("Token ID"),
    },
    READ_ONLY,
    async ({ network, contractAddress, tokenId }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).nft.computeRarity(network, { contractAddress, tokenId });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getCollectionsForOwner",
    "Get all NFT collections held by an address. Ethereum only — use getContractsForOwner for other chains. Requires select_app first.",
    {
      network: z.string().describe("Network identifier (eth-mainnet only)"),
      owner: z.string().describe("Wallet address"),
      withMetadata: z.boolean().optional().default(true).describe("Include collection metadata"),
      excludeFilters: z.array(z.enum(["SPAM", "AIRDROPS"])).optional().describe("Exclude spam or airdrop collections"),
      includeFilters: z.array(z.enum(["SPAM", "AIRDROPS"])).optional().describe("Only include spam or airdrop collections"),
      pageKey: z.string().optional().describe("Pagination key"),
      pageSize: z.number().optional().describe("Results per page"),
    },
    READ_ONLY,
    async ({ network, owner, withMetadata, excludeFilters, includeFilters, pageKey, pageSize }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const params: Record<string, string | string[] | undefined> = {
          owner,
          withMetadata: String(withMetadata),
        };
        if (excludeFilters) params["excludeFilters[]"] = excludeFilters;
        if (includeFilters) params["includeFilters[]"] = includeFilters;
        if (pageKey) params.pageKey = pageKey;
        if (pageSize) params.pageSize = String(pageSize);
        const result = await mcpDataClient.create(apiKey).nft.getCollectionsForOwner(network, params);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // reportSpam removed — write operation, not suitable for LLM tool

  // ──────────────────────────────────────────
  // Prices API
  // ──────────────────────────────────────────

  server.tool(
    "getTokenPricesBySymbol",
    "Get current prices for tokens by their symbols (e.g. ETH, BTC, USDC). Up to 25 symbols per request. Requires select_app first.",
    {
      symbols: z.array(z.string()).min(1).max(25).describe("Array of token symbols (e.g. ['ETH', 'BTC', 'USDC'])"),
    },
    READ_ONLY,
    async ({ symbols }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const result = await mcpDataClient.create(apiKey).prices.getTokenPricesBySymbol({ symbols });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getTokenPricesByAddress",
    "Get current prices for tokens by their contract addresses and networks. Up to 25 addresses per request. Requires select_app first.",
    {
      addresses: z.array(z.string()).min(1).max(25).describe("Array of 'network:address' pairs (e.g. ['eth-mainnet:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'base-mainnet:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913']). Up to 25."),
    },
    READ_ONLY,
    async ({ addresses }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const parsed = addresses.map((a: string) => {
          const idx = a.indexOf(":");
          return { network: a.slice(0, idx), address: a.slice(idx + 1) };
        });
        const result = await mcpDataClient.create(apiKey).prices.getTokenPricesByAddress({ addresses: parsed });
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getHistoricalTokenPrices",
    "Get historical price data for a token over a time range. Identify token by symbol OR by network+address. Requires select_app first.",
    {
      symbol: z.string().optional().describe("Token symbol (e.g. 'ETH'). Use this OR network+address."),
      network: z.string().optional().describe("Network identifier (use with address instead of symbol)"),
      address: z.string().optional().describe("Token contract address (use with network instead of symbol)"),
      startTime: z.string().describe("Start of time range (ISO 8601 format, e.g. '2024-01-01T00:00:00Z')"),
      endTime: z.string().describe("End of time range (ISO 8601 format)"),
      interval: z.enum(["5m", "1h", "1d"]).default("1d").describe("Time interval for data points. Max ranges: 5m→7d, 1h→30d, 1d→1yr"),
    },
    READ_ONLY,
    async ({ symbol, network, address, startTime, endTime, interval }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const body: Record<string, unknown> = { startTime, endTime, interval };
        if (symbol) {
          body.symbol = symbol;
        } else if (network && address) {
          body.network = network;
          body.address = address;
        }
        const result = await mcpDataClient.create(apiKey).prices.getHistoricalTokenPrices(body);
        return toolResult(formatResult(result));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  // ──────────────────────────────────────────
  // Portfolio / Multi-Chain Data API
  // ──────────────────────────────────────────

  server.tool(
    "getTokensByAddress",
    "Get all tokens (ERC-20) held by an address across multiple chains in a single request. Requires select_app first.",
    {
      address: z.string().describe("Wallet address"),
      networks: z.array(z.string()).optional().describe("Network identifiers to query (e.g. ['eth-mainnet', 'base-mainnet']). If omitted, queries all supported networks."),
      limit: PORTFOLIO_LIMIT,
    },
    READ_ONLY,
    async ({ address, networks, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const entry = { address, ...(networks && { networks }) };
        const body = { addresses: [entry] };
        const result = await mcpDataClient.create(apiKey).portfolio.getTokensByAddress(body);
        return toolResult(formatPortfolioResult(result, limit));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getTokenBalancesByAddress",
    "Get token balances with USD values for an address across multiple chains. Requires select_app first.",
    {
      address: z.string().describe("Wallet address"),
      networks: z.array(z.string()).optional().describe("Network identifiers to query (e.g. ['eth-mainnet', 'base-mainnet']). If omitted, queries all supported networks."),
      limit: PORTFOLIO_LIMIT,
    },
    READ_ONLY,
    async ({ address, networks, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const entry = { address, ...(networks && { networks }) };
        const body = { addresses: [entry] };
        const result = await mcpDataClient.create(apiKey).portfolio.getTokenBalancesByAddress(body);
        return toolResult(formatPortfolioResult(result, limit));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTsByAddress",
    "Get all NFTs held by an address across multiple chains in a single request. Requires select_app first.",
    {
      address: z.string().describe("Wallet address"),
      networks: z.array(z.string()).optional().describe("Network identifiers to query (e.g. ['eth-mainnet', 'base-mainnet']). If omitted, queries all supported networks."),
      limit: PORTFOLIO_LIMIT,
    },
    READ_ONLY,
    async ({ address, networks, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const entry = { address, ...(networks && { networks }) };
        const body = { addresses: [entry] };
        const result = await mcpDataClient.create(apiKey).portfolio.getNFTsByAddress(body);
        return toolResult(formatPortfolioResult(result, limit));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );

  server.tool(
    "getNFTContractsByAddress",
    "Get all NFT contracts held by an address across multiple chains. Requires select_app first.",
    {
      address: z.string().describe("Wallet address"),
      networks: z.array(z.string()).optional().describe("Network identifiers to query (e.g. ['eth-mainnet', 'base-mainnet']). If omitted, queries all supported networks."),
      limit: PORTFOLIO_LIMIT,
    },
    READ_ONLY,
    async ({ address, networks, limit }, { authInfo }) => {
      try {
        const apiKey = await getApiKey(authInfo);
        const entry = { address, ...(networks && { networks }) };
        const body = { addresses: [entry] };
        const result = await mcpDataClient.create(apiKey).portfolio.getNFTContractsByAddress(body);
        return toolResult(formatPortfolioResult(result, limit));
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}

function formatPortfolioResult(result: unknown, limit: number | undefined): string {
  return formatResult(normalizePortfolioOutput(limitPortfolioPayload(result, limit)));
}
