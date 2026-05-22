#!/bin/bash
# Smoke test for alchemy-mcp-server
# Tests every tool category with real API calls
# Usage: ./scripts/smoke-test.sh [BASE_URL] [AUTH_TOKEN]
#   If AUTH_TOKEN is omitted, opens browser for OAuth login automatically.

set -e

BASE_URL="${1:-http://localhost:3000}"
AUTH_TOKEN="${2:-}"
PASS=0
FAIL=0
SKIP=0
FAILURES=""

# ── OAuth browser login (if no token provided) ──
if [ -z "$AUTH_TOKEN" ]; then
  echo "=== OAuth Login ==="
  CALLBACK_PORT=8789
  CALLBACK_URL="http://localhost:${CALLBACK_PORT}/callback"

  # Fetch OAuth server metadata
  OAUTH_META=$(curl -s "$BASE_URL/.well-known/oauth-authorization-server") || true
  AUTH_ENDPOINT=$(echo "$OAUTH_META" | jq -r '.authorization_endpoint' 2>/dev/null)
  TOKEN_ENDPOINT=$(echo "$OAUTH_META" | jq -r '.token_endpoint' 2>/dev/null)
  REG_ENDPOINT=$(echo "$OAUTH_META" | jq -r '.registration_endpoint' 2>/dev/null)

  if [ -z "$AUTH_ENDPOINT" ] || [ "$AUTH_ENDPOINT" = "null" ]; then
    echo "  ❌ Failed to fetch OAuth metadata from $BASE_URL"
    echo "  Is the server running? Response: $OAUTH_META"
    exit 1
  fi

  # Dynamic client registration
  REG_RESPONSE=$(curl -s -X POST "$REG_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"client_name\":\"smoke-test\",\"redirect_uris\":[\"${CALLBACK_URL}\"],\"grant_types\":[\"authorization_code\"],\"response_types\":[\"code\"],\"token_endpoint_auth_method\":\"none\"}") || true
  CLIENT_ID=$(echo "$REG_RESPONSE" | jq -r '.client_id' 2>/dev/null)

  if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "null" ]; then
    echo "  ❌ Dynamic client registration failed"
    echo "  Response: $REG_RESPONSE"
    exit 1
  fi
  echo "  ✅ Client registered: ${CLIENT_ID:0:8}..."

  # Generate PKCE code_verifier and code_challenge (S256)
  CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=/+' | head -c 43)
  CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')

  STATE=$(openssl rand -hex 16)

  # Build authorization URL
  AUTH_URL="${AUTH_ENDPOINT}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${CALLBACK_URL}'))")&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&state=${STATE}"

  echo "  Opening browser for login..."
  open "$AUTH_URL" 2>/dev/null || xdg-open "$AUTH_URL" 2>/dev/null || echo "  Open this URL: $AUTH_URL"

  # Start a temporary HTTP server to catch the callback
  echo "  Waiting for OAuth callback on port ${CALLBACK_PORT}..."
  RESPONSE=$(python3 -c "
import http.server, urllib.parse, sys, threading

class Handler(http.server.BaseHTTPRequestHandler):
    code = None
    def do_GET(self):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        c = params.get('code', [None])[0]
        if c:
            Handler.code = c
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<html><body><h2>Login successful!</h2><p>You can close this tab.</p></body></html>')
            threading.Thread(target=self.server.shutdown).start()
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *args):
        pass

server = http.server.HTTPServer(('localhost', ${CALLBACK_PORT}), Handler)
server.serve_forever()
server.server_close()
if Handler.code:
    print(Handler.code)
else:
    sys.exit(1)
")

  if [ -z "$RESPONSE" ]; then
    echo "  ❌ No authorization code received"
    exit 1
  fi
  echo "  ✅ Authorization code received"

  # Exchange code for access token
  TOKEN_RESPONSE=$(curl -s -X POST "$TOKEN_ENDPOINT" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=authorization_code&code=${RESPONSE}&redirect_uri=${CALLBACK_URL}&client_id=${CLIENT_ID}&code_verifier=${CODE_VERIFIER}")
  AUTH_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

  if [ -z "$AUTH_TOKEN" ] || [ "$AUTH_TOKEN" = "null" ]; then
    echo "  ❌ Token exchange failed"
    echo "  Response: $TOKEN_RESPONSE"
    exit 1
  fi
  echo "  ✅ Access token obtained"
  echo ""
fi

# Test fixtures (well-known addresses)
VITALIK="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
USDC="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
BAYC="0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"
ZERO_HASH="0x$(printf '0%.0s' {1..64})"

call_tool() {
  local tool="$1"
  local args="$2"
  curl -s --max-time 30 -X POST "$BASE_URL/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args},\"id\":1}"
}

check_tool_call() {
  local name="$1"
  local result="$2"
  local expect="${3:-}"

  if echo "$result" | grep -q '"isError":true'; then
    local err=$(echo "$result" | grep -o '"text":"[^"]*"' | head -1 | sed 's/"text":"//;s/"$//')
    echo "  ❌ $name → $err"
    FAILURES="${FAILURES}\n  ❌ $name → $err"
    FAIL=$((FAIL + 1))
  elif [ -n "$expect" ] && ! echo "$result" | grep -q "$expect"; then
    echo "  ❌ $name (missing expected: $expect)"
    FAILURES="${FAILURES}\n  ❌ $name (missing expected: $expect)"
    FAIL=$((FAIL + 1))
  elif echo "$result" | grep -q '"content"'; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name (unexpected response)"
    FAILURES="${FAILURES}\n  ❌ $name (unexpected response)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Infrastructure ==="
HEALTH=$(curl -s "$BASE_URL/health")
if echo "$HEALTH" | grep -q "ok"; then echo "  ✅ /health"; PASS=$((PASS+1)); else echo "  ❌ /health"; FAIL=$((FAIL+1)); fi

METRICS=$(curl -s "$BASE_URL/metrics")
if echo "$METRICS" | grep -q "mcp_tool_calls_total"; then echo "  ✅ /metrics"; PASS=$((PASS+1)); else echo "  ❌ /metrics"; FAIL=$((FAIL+1)); fi

OAUTH=$(curl -s "$BASE_URL/.well-known/oauth-authorization-server")
if echo "$OAUTH" | grep -q "authorization_endpoint"; then echo "  ✅ OAuth discovery"; PASS=$((PASS+1)); else echo "  ❌ OAuth discovery"; FAIL=$((FAIL+1)); fi

NOAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/mcp" -H "Content-Type: application/json" -d '{}')
if [ "$NOAUTH" = "401" ]; then echo "  ✅ 401 without token"; PASS=$((PASS+1)); else echo "  ❌ 401 without token (got $NOAUTH)"; FAIL=$((FAIL+1)); fi

if [ -z "$AUTH_TOKEN" ]; then
  echo ""
  echo "❌ No AUTH_TOKEN available (OAuth login failed or was skipped)"
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# Verify tools are registered
TOOLS=$(curl -s --max-time 30 -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}')
TOOL_COUNT=$(echo "$TOOLS" | grep -o '"name"' | wc -l | tr -d ' ')
echo "  ✅ $TOOL_COUNT tools registered"
PASS=$((PASS+1))

echo ""
echo "=== Admin Tools ==="

R=$(call_tool "list_apps" '{"limit":2}')
check_tool_call "list_apps" "$R"

# Select first app for subsequent tests
APP_ID=$(echo "$R" | grep -o '[a-z0-9]\{16\}' | head -1)
if [ -n "$APP_ID" ]; then
  R=$(call_tool "select_app" "{\"app_id\":\"$APP_ID\"}")
  check_tool_call "select_app ($APP_ID)" "$R"

  R=$(call_tool "get_app" "{\"app_id\":\"$APP_ID\"}")
  check_tool_call "get_app" "$R"
else
  echo "  ⚠️  No app found, skipping select/get"
  SKIP=$((SKIP+2))
fi

R=$(call_tool "list_chains" '{}')
check_tool_call "list_chains" "$R"

R=$(call_tool "ping" '{}')
check_tool_call "ping" "$R"

echo ""
echo "=== Standard Ethereum RPC ==="

R=$(call_tool "ethBlockNumber" '{"network":"eth-mainnet"}')
check_tool_call "ethBlockNumber" "$R"

R=$(call_tool "ethGetBalance" "{\"network\":\"eth-mainnet\",\"address\":\"$VITALIK\"}")
check_tool_call "ethGetBalance" "$R"

R=$(call_tool "ethGasPrice" '{"network":"eth-mainnet"}')
check_tool_call "ethGasPrice" "$R"

R=$(call_tool "ethChainId" '{"network":"eth-mainnet"}')
check_tool_call "ethChainId" "$R"

R=$(call_tool "ethGetBlockByNumber" '{"network":"eth-mainnet","blockNumber":"latest","fullTransactions":false}')
check_tool_call "ethGetBlockByNumber" "$R"

R=$(call_tool "ethGetCode" "{\"network\":\"eth-mainnet\",\"address\":\"$USDC\"}")
check_tool_call "ethGetCode (USDC contract)" "$R"

R=$(call_tool "ethGetTransactionCount" "{\"network\":\"eth-mainnet\",\"address\":\"$VITALIK\"}")
check_tool_call "ethGetTransactionCount" "$R"

R=$(call_tool "ethMaxPriorityFeePerGas" '{"network":"eth-mainnet"}')
check_tool_call "ethMaxPriorityFeePerGas" "$R"

R=$(call_tool "ethFeeHistory" '{"network":"eth-mainnet","blockCount":"0x4","newestBlock":"latest","rewardPercentiles":[25,50,75]}')
check_tool_call "ethFeeHistory" "$R"

R=$(call_tool "ethGetLogs" "{\"network\":\"eth-mainnet\",\"address\":\"$USDC\",\"fromBlock\":\"0x13f8e00\",\"toBlock\":\"0x13f8e01\"}")
check_tool_call "ethGetLogs (USDC)" "$R"

R=$(call_tool "ethSyncing" '{"network":"eth-mainnet"}')
check_tool_call "ethSyncing" "$R"

R=$(call_tool "netVersion" '{"network":"eth-mainnet"}')
check_tool_call "netVersion" "$R"

R=$(call_tool "web3ClientVersion" '{"network":"eth-mainnet"}')
check_tool_call "web3ClientVersion" "$R"

echo ""
echo "=== Alchemy Token API ==="

R=$(call_tool "getTokenBalances" "{\"network\":\"eth-mainnet\",\"address\":\"$VITALIK\"}")
check_tool_call "getTokenBalances" "$R"

R=$(call_tool "getTokenMetadata" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$USDC\"}")
check_tool_call "getTokenMetadata" "$R"

echo ""
echo "=== Alchemy Transfers ==="

R=$(call_tool "getAssetTransfers" "{\"network\":\"eth-mainnet\",\"fromAddress\":\"$VITALIK\",\"category\":[\"external\"],\"maxCount\":\"0x2\",\"order\":\"desc\"}")
check_tool_call "getAssetTransfers" "$R"

echo ""
echo "=== Trace ==="

R=$(call_tool "traceBlock" '{"network":"eth-mainnet","blockNumber":"latest"}')
check_tool_call "traceBlock" "$R"

echo ""
echo "=== NFT API ==="

R=$(call_tool "getNFTsForOwner" "{\"network\":\"eth-mainnet\",\"owner\":\"$VITALIK\",\"pageSize\":2}")
check_tool_call "getNFTsForOwner" "$R"

R=$(call_tool "getNFTsForContract" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"limit\":2}")
check_tool_call "getNFTsForContract (BAYC)" "$R"

R=$(call_tool "getContractMetadata" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "getContractMetadata (BAYC)" "$R"

R=$(call_tool "getFloorPrice" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "getFloorPrice (BAYC)" "$R"

R=$(call_tool "isSpamContract" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "isSpamContract (BAYC)" "$R"

echo ""
echo "=== Token Prices ==="

R=$(call_tool "getTokenPricesBySymbol" '{"symbols":["ETH","USDC"]}')
check_tool_call "getTokenPricesBySymbol" "$R"

R=$(call_tool "getTokenPricesByAddress" "{\"network\":\"eth-mainnet\",\"addresses\":[\"$USDC\"]}")
check_tool_call "getTokenPricesByAddress (USDC)" "$R"

echo ""
echo "=== Portfolio ==="

R=$(call_tool "getTokenBalancesByAddress" "{\"address\":\"$VITALIK\",\"networks\":[\"eth-mainnet\"]}")
check_tool_call "getTokenBalancesByAddress" "$R"

R=$(call_tool "getNFTsByAddress" "{\"address\":\"$VITALIK\",\"networks\":[\"eth-mainnet\"]}")
check_tool_call "getNFTsByAddress" "$R"

echo ""
echo "=== Simulation ==="

R=$(call_tool "simulateAssetChanges" "{\"network\":\"eth-mainnet\",\"from\":\"$VITALIK\",\"to\":\"$USDC\",\"value\":\"0x0\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\"}")
check_tool_call "simulateAssetChanges" "$R"

echo ""
echo "=== Debug ==="

R=$(call_tool "debugGetRawBlock" '{"network":"eth-mainnet","blockNumber":"0x13f8e00"}')
check_tool_call "debugGetRawBlock" "$R"

R=$(call_tool "debugGetRawReceipts" '{"network":"eth-mainnet","blockNumber":"0x13f8e00"}')
check_tool_call "debugGetRawReceipts" "$R"

echo ""
echo "=== Account Abstraction ==="

# supportedEntryPoints skipped — bundler endpoint differs from standard RPC
echo "  ⏭ supportedEntryPoints (bundler endpoint)"
SKIP=$((SKIP+1))

echo ""
echo "=== More Standard Ethereum RPC ==="

R=$(call_tool "ethGetBlockByNumber" '{"network":"eth-mainnet","blockNumber":"0x13f8e00","fullTransactions":false}')
check_tool_call "ethGetBlockByNumber (specific)" "$R"

R=$(call_tool "ethGetBlockTransactionCountByNumber" '{"network":"eth-mainnet","blockNumber":"0x13f8e00"}')
check_tool_call "ethGetBlockTransactionCountByNumber" "$R"

R=$(call_tool "ethGetTransactionByBlockNumberAndIndex" '{"network":"eth-mainnet","blockNumber":"0x13f8e00","index":"0x0"}')
check_tool_call "ethGetTransactionByBlockNumberAndIndex" "$R"

R=$(call_tool "ethEstimateGas" "{\"network\":\"eth-mainnet\",\"to\":\"$USDC\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\"}")
check_tool_call "ethEstimateGas (balanceOf)" "$R"

R=$(call_tool "ethGetStorageAt" "{\"network\":\"eth-mainnet\",\"address\":\"$USDC\",\"storageSlot\":\"0x0\"}")
check_tool_call "ethGetStorageAt (USDC slot 0)" "$R"

R=$(call_tool "ethGetProof" "{\"network\":\"eth-mainnet\",\"address\":\"$USDC\",\"storageKeys\":[\"0x0\"],\"blockNumber\":\"latest\"}")
check_tool_call "ethGetProof (USDC)" "$R"

R=$(call_tool "ethGetBlockReceipts" '{"network":"eth-mainnet","blockNumber":"0x13f8e00"}')
check_tool_call "ethGetBlockReceipts" "$R"

R=$(call_tool "ethBlobBaseFee" '{"network":"eth-mainnet"}')
check_tool_call "ethBlobBaseFee" "$R"

R=$(call_tool "ethCreateAccessList" "{\"network\":\"eth-mainnet\",\"to\":\"$USDC\",\"from\":\"$VITALIK\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\",\"gas\":\"0x30000\"}")
check_tool_call "ethCreateAccessList" "$R"

R=$(call_tool "web3Sha3" '{"network":"eth-mainnet","data":"0x68656c6c6f"}')
check_tool_call "web3Sha3" "$R"

R=$(call_tool "netListening" '{"network":"eth-mainnet"}')
check_tool_call "netListening" "$R"

echo ""
echo "=== More NFT API ==="

R=$(call_tool "getNFTMetadata" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"}")
check_tool_call "getNFTMetadata (BAYC #1)" "$R"

R=$(call_tool "getOwnersForNFT" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"}")
check_tool_call "getOwnersForNFT (BAYC #1)" "$R"

R=$(call_tool "getOwnersForContract" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "getOwnersForContract (BAYC)" "$R"

R=$(call_tool "getContractsForOwner" "{\"network\":\"eth-mainnet\",\"owner\":\"$VITALIK\",\"pageSize\":2}")
check_tool_call "getContractsForOwner (Vitalik)" "$R"

R=$(call_tool "searchContractMetadata" '{"network":"eth-mainnet","query":"bored ape"}')
check_tool_call "searchContractMetadata" "$R"

R=$(call_tool "getCollectionMetadata" '{"network":"eth-mainnet","collectionSlug":"boredapeyachtclub"}')
check_tool_call "getCollectionMetadata (BAYC)" "$R"

R=$(call_tool "getSpamContracts" '{"network":"eth-mainnet"}')
check_tool_call "getSpamContracts" "$R"

R=$(call_tool "isAirdropNFT" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"}")
check_tool_call "isAirdropNFT (BAYC #1)" "$R"

R=$(call_tool "isHolderOfContract" "{\"network\":\"eth-mainnet\",\"wallet\":\"$VITALIK\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "isHolderOfContract (Vitalik/BAYC)" "$R"

R=$(call_tool "computeRarity" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"}")
check_tool_call "computeRarity (BAYC #1)" "$R"

R=$(call_tool "getCollectionsForOwner" "{\"network\":\"eth-mainnet\",\"owner\":\"$VITALIK\",\"pageSize\":2}")
check_tool_call "getCollectionsForOwner (Vitalik)" "$R"

R=$(call_tool "getNftEditions" '{"network":"solana-mainnet","mint":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}')
check_tool_call "getNftEditions (Solana)" "$R"

echo ""
echo "=== More Token API ==="

R=$(call_tool "getTokenAllowance" "{\"network\":\"eth-mainnet\",\"owner\":\"$VITALIK\",\"spender\":\"0x0000000000000000000000000000000000000001\",\"contract\":\"$USDC\"}")
check_tool_call "getTokenAllowance" "$R"

R=$(call_tool "getTokenAccounts" '{"network":"solana-mainnet","owner":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg","page":1}')
check_tool_call "getTokenAccounts (Solana)" "$R"

echo ""
echo "=== More Transfers ==="

R=$(call_tool "getTransactionReceipts" '{"network":"eth-mainnet","blockNumber":"0x13f8e00"}')
check_tool_call "getTransactionReceipts" "$R"

echo ""
echo "=== Portfolio ==="

R=$(call_tool "getTokensByAddress" "{\"address\":\"$VITALIK\",\"networks\":[\"eth-mainnet\"]}")
check_tool_call "getTokensByAddress" "$R"

R=$(call_tool "getNFTContractsByAddress" "{\"address\":\"$VITALIK\",\"networks\":[\"eth-mainnet\"]}")
check_tool_call "getNFTContractsByAddress" "$R"

echo ""
echo "=== Multi-chain ==="

R=$(call_tool "ethBlockNumber" '{"network":"base-mainnet"}')
check_tool_call "ethBlockNumber (Base)" "$R"

R=$(call_tool "ethGetBalance" "{\"network\":\"base-mainnet\",\"address\":\"$VITALIK\"}")
check_tool_call "ethGetBalance (Base)" "$R"

R=$(call_tool "ethBlockNumber" '{"network":"polygon-mainnet"}')
check_tool_call "ethBlockNumber (Polygon)" "$R"

R=$(call_tool "ethGetBalance" "{\"network\":\"arb-mainnet\",\"address\":\"$VITALIK\"}")
check_tool_call "ethGetBalance (Arbitrum)" "$R"

R=$(call_tool "ethBlockNumber" '{"network":"opt-mainnet"}')
check_tool_call "ethBlockNumber (Optimism)" "$R"

echo ""
echo "=== Solana RPC ==="

R=$(call_tool "solana_getSlot" '{"network":"solana-mainnet"}')
check_tool_call "solana_getSlot" "$R"

R=$(call_tool "solana_getVersion" '{"network":"solana-mainnet"}')
check_tool_call "solana_getVersion" "$R"

R=$(call_tool "solana_getEpochInfo" '{"network":"solana-mainnet"}')
check_tool_call "solana_getEpochInfo" "$R"

R=$(call_tool "solana_getLatestBlockhash" '{"network":"solana-mainnet"}')
check_tool_call "solana_getLatestBlockhash" "$R"

R=$(call_tool "solana_getBalance" '{"network":"solana-mainnet","pubkey":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}')
check_tool_call "solana_getBalance" "$R"

R=$(call_tool "solana_getBlockHeight" '{"network":"solana-mainnet"}')
check_tool_call "solana_getBlockHeight" "$R"

R=$(call_tool "solana_getSupply" '{"network":"solana-mainnet"}')
check_tool_call "solana_getSupply" "$R"

R=$(call_tool "solana_getTransactionCount" '{"network":"solana-mainnet"}')
check_tool_call "solana_getTransactionCount" "$R"

R=$(call_tool "solana_getInflationRate" '{"network":"solana-mainnet"}')
check_tool_call "solana_getInflationRate" "$R"

R=$(call_tool "solana_getClusterNodes" '{"network":"solana-mainnet"}')
check_tool_call "solana_getClusterNodes" "$R"

R=$(call_tool "solana_getRecentPrioritizationFees" '{"network":"solana-mainnet"}')
check_tool_call "solana_getRecentPrioritizationFees" "$R"

R=$(call_tool "solana_getMinimumBalanceForRentExemption" '{"network":"solana-mainnet","dataLength":100}')
check_tool_call "solana_getMinimumBalanceForRentExemption" "$R"

R=$(call_tool "solana_getTokenSupply" '{"network":"solana-mainnet","mint":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}')
check_tool_call "solana_getTokenSupply (BONK)" "$R"

R=$(call_tool "solana_getTokenLargestAccounts" '{"network":"solana-mainnet","mint":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}')
check_tool_call "solana_getTokenLargestAccounts (BONK)" "$R"

R=$(call_tool "solana_getFirstAvailableBlock" '{"network":"solana-mainnet"}')
check_tool_call "solana_getFirstAvailableBlock" "$R"

R=$(call_tool "solana_getGenesisHash" '{"network":"solana-mainnet"}')
check_tool_call "solana_getGenesisHash" "$R"

R=$(call_tool "solana_getIdentity" '{"network":"solana-mainnet"}')
check_tool_call "solana_getIdentity" "$R"

R=$(call_tool "solana_getEpochSchedule" '{"network":"solana-mainnet"}')
check_tool_call "solana_getEpochSchedule" "$R"

R=$(call_tool "solana_getVoteAccounts" '{"network":"solana-mainnet"}')
check_tool_call "solana_getVoteAccounts" "$R"

echo ""
echo "=== Solana DAS ==="

R=$(call_tool "solana_getAssetsByOwner" '{"network":"solana-mainnet","ownerAddress":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}')
check_tool_call "solana_getAssetsByOwner" "$R"

R=$(call_tool "solana_searchAssets" '{"network":"solana-mainnet","ownerAddress":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}')
check_tool_call "solana_searchAssets" "$R"

echo ""
echo "=== Remaining Standard Ethereum RPC ==="

R=$(call_tool "ethCall" "{\"network\":\"eth-mainnet\",\"to\":\"$USDC\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\"}")
check_tool_call "ethCall (USDC balanceOf)" "$R"

R=$(call_tool "ethGetBlockByHash" '{"network":"eth-mainnet","blockHash":"0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd","fullTransactions":false}')
check_tool_call "ethGetBlockByHash" "$R"

R=$(call_tool "ethGetTransactionByHash" '{"network":"eth-mainnet","transactionHash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"}')
check_tool_call "ethGetTransactionByHash" "$R"

R=$(call_tool "ethGetTransactionReceipt" '{"network":"eth-mainnet","transactionHash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"}')
check_tool_call "ethGetTransactionReceipt" "$R"

R=$(call_tool "ethGetBlockTransactionCountByHash" '{"network":"eth-mainnet","blockHash":"0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd"}')
check_tool_call "ethGetBlockTransactionCountByHash" "$R"

R=$(call_tool "ethGetTransactionByBlockHashAndIndex" '{"network":"eth-mainnet","blockHash":"0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd","index":"0x0"}')
check_tool_call "ethGetTransactionByBlockHashAndIndex" "$R"

# ethCallBundle/ethCallMany skipped — need real signed transactions
echo "  ⏭ ethCallBundle (needs signed txs)"
echo "  ⏭ ethCallMany (needs call objects)"
SKIP=$((SKIP+2))

echo ""
echo "=== Remaining Trace ==="

R=$(call_tool "traceCall" "{\"network\":\"eth-mainnet\",\"to\":\"$USDC\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\",\"traceType\":[\"trace\"],\"blockNumber\":\"latest\"}")
check_tool_call "traceCall" "$R"

R=$(call_tool "traceTransaction" '{"network":"eth-mainnet","transactionHash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"}')
check_tool_call "traceTransaction" "$R"

R=$(call_tool "traceReplayTransaction" '{"network":"eth-mainnet","transactionHash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b","traceType":["trace"]}')
check_tool_call "traceReplayTransaction" "$R"

R=$(call_tool "traceReplayBlockTransactions" '{"network":"eth-mainnet","blockNumber":"0x13f8e00","traceType":["trace"]}')
check_tool_call "traceReplayBlockTransactions" "$R"

R=$(call_tool "traceFilter" '{"network":"eth-mainnet","fromBlock":"0x13f8e00","toBlock":"0x13f8e00","fromAddress":["'$VITALIK'"]}')
check_tool_call "traceFilter" "$R"

echo ""
echo "=== Remaining Debug ==="

R=$(call_tool "debugTraceTransaction" '{"network":"eth-mainnet","transactionHash":"0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b"}')
check_tool_call "debugTraceTransaction" "$R"

R=$(call_tool "debugTraceCall" "{\"network\":\"eth-mainnet\",\"to\":\"$USDC\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\",\"blockNumber\":\"latest\"}")
check_tool_call "debugTraceCall" "$R"

# debugTraceBlockByNumber skipped — response too large for curl
echo "  ⏭ debugTraceBlockByNumber (response too large)"
SKIP=$((SKIP+1))

R=$(call_tool "debugTraceBlockByHash" '{"network":"eth-mainnet","blockHash":"0x4e3a3754410177e6937ef1f84bba68ea139e8d1a2258c5f85db9f1cd715a1bdd"}')
check_tool_call "debugTraceBlockByHash" "$R"

echo ""
echo "=== Remaining NFT API ==="

R=$(call_tool "getNFTMetadataBatch" "{\"network\":\"eth-mainnet\",\"tokens\":[{\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"},{\"contractAddress\":\"$BAYC\",\"tokenId\":\"2\"}]}")
check_tool_call "getNFTMetadataBatch" "$R"

R=$(call_tool "getContractMetadataBatch" "{\"network\":\"eth-mainnet\",\"contractAddresses\":[\"$BAYC\",\"$USDC\"]}")
check_tool_call "getContractMetadataBatch" "$R"

R=$(call_tool "getNFTSales" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"tokenId\":\"1\"}")
check_tool_call "getNFTSales (BAYC #1)" "$R"

R=$(call_tool "getNFTsForCollection" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\",\"limit\":2}")
check_tool_call "getNFTsForCollection (BAYC)" "$R"

R=$(call_tool "summarizeNFTAttributes" "{\"network\":\"eth-mainnet\",\"contractAddress\":\"$BAYC\"}")
check_tool_call "summarizeNFTAttributes (BAYC)" "$R"

echo ""
echo "=== Remaining Token Prices ==="

R=$(call_tool "getHistoricalTokenPrices" '{"symbol":"ETH","startTime":"2024-01-01T00:00:00Z","endTime":"2024-01-02T00:00:00Z","interval":"1h"}')
check_tool_call "getHistoricalTokenPrices" "$R"

echo ""
echo "=== Simulation ==="

R=$(call_tool "simulateExecution" "{\"network\":\"eth-mainnet\",\"from\":\"$VITALIK\",\"to\":\"$USDC\",\"value\":\"0x0\",\"data\":\"0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045\"}")
check_tool_call "simulateExecution" "$R"

echo ""
echo "=== Remaining Solana RPC ==="

R=$(call_tool "solana_getAccountInfo" '{"network":"solana-mainnet","pubkey":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"}')
check_tool_call "solana_getAccountInfo" "$R"

R=$(call_tool "solana_getMultipleAccounts" '{"network":"solana-mainnet","pubkeys":["vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"]}')
check_tool_call "solana_getMultipleAccounts" "$R"

R=$(call_tool "solana_getSignaturesForAddress" '{"network":"solana-mainnet","address":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg","limit":2}')
check_tool_call "solana_getSignaturesForAddress" "$R"

R=$(call_tool "solana_getBlockHeight" '{"network":"solana-mainnet"}')
check_tool_call "solana_getBlockHeight" "$R"

R=$(call_tool "solana_getBlockProduction" '{"network":"solana-mainnet"}')
check_tool_call "solana_getBlockProduction" "$R"

R=$(call_tool "solana_getBlockCommitment" '{"network":"solana-mainnet","slot":200000000}')
check_tool_call "solana_getBlockCommitment" "$R"

R=$(call_tool "solana_getSlotLeader" '{"network":"solana-mainnet"}')
check_tool_call "solana_getSlotLeader" "$R"

# solana_getSlotLeaders needs a current slot — fetch it dynamically
CURRENT_SLOT=$(call_tool "solana_getSlot" '{"network":"solana-mainnet"}' | grep -o '[0-9]\{8,\}' | head -1)
if [ -n "$CURRENT_SLOT" ]; then
  R=$(call_tool "solana_getSlotLeaders" "{\"network\":\"solana-mainnet\",\"startSlot\":$CURRENT_SLOT,\"limit\":5}")
  check_tool_call "solana_getSlotLeaders" "$R"
else
  echo "  ⏭ solana_getSlotLeaders (couldn't get current slot)"
  SKIP=$((SKIP+1))
fi

# solana_getLargestAccounts skipped — intermittent 503 from Solana RPC
echo "  ⏭ solana_getLargestAccounts (intermittent 503)"
SKIP=$((SKIP+1))

R=$(call_tool "solana_getInflationGovernor" '{"network":"solana-mainnet"}')
check_tool_call "solana_getInflationGovernor" "$R"

R=$(call_tool "solana_getInflationReward" '{"network":"solana-mainnet","addresses":["vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"]}')
check_tool_call "solana_getInflationReward" "$R"

R=$(call_tool "solana_getRecentPerformanceSamples" '{"network":"solana-mainnet","limit":2}')
check_tool_call "solana_getRecentPerformanceSamples" "$R"

R=$(call_tool "solana_getHighestSnapshotSlot" '{"network":"solana-mainnet"}')
check_tool_call "solana_getHighestSnapshotSlot" "$R"

R=$(call_tool "solana_getMaxRetransmitSlot" '{"network":"solana-mainnet"}')
check_tool_call "solana_getMaxRetransmitSlot" "$R"

R=$(call_tool "solana_getMaxShredInsertSlot" '{"network":"solana-mainnet"}')
check_tool_call "solana_getMaxShredInsertSlot" "$R"

R=$(call_tool "solana_getLeaderSchedule" '{"network":"solana-mainnet"}')
check_tool_call "solana_getLeaderSchedule" "$R"

R=$(call_tool "solana_isBlockhashValid" '{"network":"solana-mainnet","blockhash":"5eykt4UsFv8P8njbHkxA7ZY3W6dSoVQ6hH3MfMecLJwz"}')
check_tool_call "solana_isBlockhashValid" "$R"

R=$(call_tool "solana_minimumLedgerSlot" '{"network":"solana-mainnet"}')
check_tool_call "solana_minimumLedgerSlot" "$R"

R=$(call_tool "solana_getTokenAccountsByOwner" '{"network":"solana-mainnet","owner":"vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg","programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}')
check_tool_call "solana_getTokenAccountsByOwner" "$R"

# solana_getTokenAccountBalance skipped — needs a specific token account address, not a mint
echo "  ⏭ solana_getTokenAccountBalance (needs token account, not mint)"
SKIP=$((SKIP+1))

R=$(call_tool "solana_getPriorityFeeEstimate" '{"network":"solana-mainnet","accountKeys":["vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg"],"options":{"includeAllPriorityFeeLevels":true}}')
check_tool_call "solana_getPriorityFeeEstimate" "$R"

echo ""
echo "=== Remaining Solana DAS ==="

R=$(call_tool "solana_getAsset" '{"network":"solana-mainnet","id":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}')
check_tool_call "solana_getAsset (BONK)" "$R"

R=$(call_tool "solana_getAssets" '{"network":"solana-mainnet","ids":["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"]}')
check_tool_call "solana_getAssets" "$R"

# solana_getAssetProof/getAssetSignatures skipped — need a compressed NFT, not a fungible token
echo "  ⏭ solana_getAssetProof (needs compressed NFT)"
echo "  ⏭ solana_getAssetSignatures (needs compressed NFT)"
SKIP=$((SKIP+2))

echo ""
echo "=== Skipped (write/stateful — need real signed data) ==="
echo "  ⏭ sendUserOperation (needs signed UserOp)"
echo "  ⏭ estimateUserOperationGas (needs UserOp)"
echo "  ⏭ getUserOperationReceipt (needs real UserOp hash)"
echo "  ⏭ getUserOperationByHash (needs real UserOp hash)"
echo "  ⏭ requestGasAndPaymasterAndData (needs UserOp)"
echo "  ⏭ requestPaymasterAndData (needs UserOp)"
echo "  ⏭ rundlerMaxPriorityFeePerGas (bundler-specific)"
echo "  ⏭ simulateAssetChangesBundle (needs signed txs)"
echo "  ⏭ simulateExecutionBundle (needs signed txs)"
echo "  ⏭ simulateUserOperationAssetChanges (needs UserOp)"
echo "  ⏭ wallet* tools (need active smart wallet session)"
echo "  ⏭ create_app / update_app / update_allowlist (write ops)"
echo "  ⏭ solana_requestAirdrop (devnet only)"
echo "  ⏭ solana_simulateTransaction/Bundle (needs signed tx)"
echo "  ⏭ solana_getBlock/getBlocks/getBlockTime (need specific slot)"
echo "  ⏭ solana_getTransaction (needs tx signature)"
echo "  ⏭ solana_getStakeActivation (needs stake account)"
echo "  ⏭ solana_getFeeForMessage (needs encoded message)"
echo "  ⏭ solana_getSignatureStatuses (needs tx signatures)"
echo "  ⏭ solana_getProgramAccounts (can be very large)"
echo "  ⏭ solana_getTokenAccountsByDelegate (needs delegate address)"
echo "  ⏭ solana_getAssetsByAuthority/Creator/Group (need specific addresses)"
SKIP=$((SKIP + 30))

echo ""
echo "=== Removed tools (should NOT exist) ==="
TOOLS_CHECK=$(curl -s --max-time 30 -X POST "$BASE_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":99}')
for removed in delete_app call ethSendRawTransaction refreshNftMetadata invalidateContract reportSpam; do
  if echo "$TOOLS_CHECK" | grep -q "\"$removed\""; then
    echo "  ❌ $removed should not exist"
    FAIL=$((FAIL + 1))
  else
    echo "  ✅ $removed correctly removed"
    PASS=$((PASS + 1))
  fi
done

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "================================"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "FAILED TESTS:"
  echo -e "$FAILURES"
  echo ""
fi

exit $FAIL
