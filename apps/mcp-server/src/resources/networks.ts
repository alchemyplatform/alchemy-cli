import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ListResourcesResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { listChains, type ChainNetwork } from "../clients/admin.js";
import { requireAuth } from "../tools/helpers.js";

type ResourceServer = Pick<McpServer, "registerResource">;

const MIME_TYPE = "application/json";
const NETWORKS_URI = "alchemy://networks";
const EVM_NETWORKS_URI = "alchemy://networks/evm";
const SOLANA_NETWORKS_URI = "alchemy://networks/solana";
const NETWORK_URI_TEMPLATE = "alchemy://networks/{networkId}";

type ResourceExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type NetworkEcosystem = "evm" | "solana" | "unknown";

function getEcosystem(chain: ChainNetwork): NetworkEcosystem {
  const id = chain.id.toLowerCase();
  const name = chain.name.toLowerCase();
  if (id.includes("solana") || name.includes("solana")) return "solana";
  if (chain.networkChainId) return "evm";
  return "unknown";
}

function networkUri(networkId: string): string {
  return `alchemy://networks/${encodeURIComponent(networkId)}`;
}

function formatNetwork(chain: ChainNetwork) {
  return {
    id: chain.id,
    name: chain.name,
    ecosystem: getEcosystem(chain),
    networkChainId: chain.networkChainId,
    isTestnet: chain.isTestnet,
    availability: chain.availability,
    docsUrl: chain.docsUrl,
    explorerUrl: chain.explorerUrl,
    currency: chain.currency,
  };
}

async function getChains(extra: ResourceExtra): Promise<ChainNetwork[]> {
  const token = requireAuth(extra.authInfo);
  return listChains(token);
}

function jsonResource(uri: string, body: unknown): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: MIME_TYPE,
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}

function networkCatalog(chains: ChainNetwork[], ecosystem?: NetworkEcosystem) {
  const networks = ecosystem
    ? chains.filter((chain) => getEcosystem(chain) === ecosystem)
    : chains;

  return {
    count: networks.length,
    networks: networks.map(formatNetwork),
  };
}

function networkResourceListing(chains: ChainNetwork[]): ListResourcesResult {
  return {
    resources: chains.map((chain) => ({
      uri: networkUri(chain.id),
      name: chain.id,
      title: chain.name,
      description:
        `${chain.name} network metadata` +
        `${chain.isTestnet ? " (testnet)" : ""}` +
        `${chain.networkChainId ? `, chain ID ${chain.networkChainId}` : ""}`,
      mimeType: MIME_TYPE,
    })),
  };
}

function getNetworkId(variable: string | string[] | undefined): string {
  const value = Array.isArray(variable) ? variable[0] : variable;
  if (!value) throw new Error("Missing networkId in resource URI");
  return decodeURIComponent(value);
}

export function registerNetworkResources(server: ResourceServer): void {
  server.registerResource(
    "networks",
    NETWORKS_URI,
    {
      title: "Alchemy Networks",
      description: "All blockchain networks supported by Alchemy.",
      mimeType: MIME_TYPE,
    },
    async (_uri, extra) => {
      const chains = await getChains(extra);
      return jsonResource(NETWORKS_URI, networkCatalog(chains));
    },
  );

  server.registerResource(
    "evm-networks",
    EVM_NETWORKS_URI,
    {
      title: "Alchemy EVM Networks",
      description: "EVM networks supported by Alchemy.",
      mimeType: MIME_TYPE,
    },
    async (_uri, extra) => {
      const chains = await getChains(extra);
      return jsonResource(EVM_NETWORKS_URI, networkCatalog(chains, "evm"));
    },
  );

  server.registerResource(
    "solana-networks",
    SOLANA_NETWORKS_URI,
    {
      title: "Alchemy Solana Networks",
      description: "Solana networks supported by Alchemy.",
      mimeType: MIME_TYPE,
    },
    async (_uri, extra) => {
      const chains = await getChains(extra);
      return jsonResource(SOLANA_NETWORKS_URI, networkCatalog(chains, "solana"));
    },
  );

  server.registerResource(
    "network",
    new ResourceTemplate(NETWORK_URI_TEMPLATE, {
      list: async (extra) => networkResourceListing(await getChains(extra)),
    }),
    {
      title: "Alchemy Network",
      description: "Metadata for a specific Alchemy network by network ID.",
      mimeType: MIME_TYPE,
    },
    async (uri, variables, extra) => {
      const networkId = getNetworkId(variables.networkId);
      const chains = await getChains(extra);
      const chain = chains.find((candidate) => candidate.id === networkId);

      if (!chain) {
        throw new Error(`Network not found: ${networkId}`);
      }

      return jsonResource(uri.toString(), formatNetwork(chain));
    },
  );
}
