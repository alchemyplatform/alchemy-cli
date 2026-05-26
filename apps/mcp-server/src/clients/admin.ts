import {
  createAlchemyAdminClient,
  createApp as sharedCreateApp,
  deleteApp as sharedDeleteApp,
  getApp as sharedGetApp,
  listApps as sharedListApps,
  listChains as sharedListChains,
  updateAddressAllowlist as sharedUpdateAddressAllowlist,
  updateApp as sharedUpdateApp,
  updateIpAllowlist as sharedUpdateIpAllowlist,
  updateNetworkAllowlist as sharedUpdateNetworkAllowlist,
  updateOriginAllowlist as sharedUpdateOriginAllowlist,
  type AdminClientOptions,
} from "@alchemy/sdk/admin";

export type {
  AllowlistEntry,
  App,
  AppChainNetwork,
  ChainNetwork,
  ListAppsResponse,
} from "@alchemy/sdk/admin";
export { AdminApiError } from "@alchemy/sdk/admin";

const MCP_CLIENT_OPTIONS = {
  breadcrumb: "alchemy-mcp-server",
} as const satisfies AdminClientOptions;

export const mcpAdminClient = createAlchemyAdminClient(MCP_CLIENT_OPTIONS);

export async function getApp(authToken: string, appId: string) {
  return sharedGetApp(authToken, appId, MCP_CLIENT_OPTIONS);
}

export async function listApps(authToken: string, opts?: { cursor?: string; limit?: number }) {
  return sharedListApps(authToken, opts, MCP_CLIENT_OPTIONS);
}

export async function createApp(
  authToken: string,
  body: { name: string; networkAllowlist: string[]; description?: string; products?: string[] },
) {
  return sharedCreateApp(authToken, body, MCP_CLIENT_OPTIONS);
}

export async function updateApp(
  authToken: string,
  appId: string,
  body: { name?: string; description?: string },
) {
  return sharedUpdateApp(authToken, appId, body, MCP_CLIENT_OPTIONS);
}

export async function deleteApp(authToken: string, appId: string) {
  return sharedDeleteApp(authToken, appId, MCP_CLIENT_OPTIONS);
}

export async function updateNetworkAllowlist(
  authToken: string,
  appId: string,
  chainNetworks: string[],
) {
  return sharedUpdateNetworkAllowlist(authToken, appId, chainNetworks, MCP_CLIENT_OPTIONS);
}

export async function updateAddressAllowlist(
  authToken: string,
  appId: string,
  addressAllowlist: Array<{ name?: string; value: string }>,
) {
  return sharedUpdateAddressAllowlist(authToken, appId, addressAllowlist, MCP_CLIENT_OPTIONS);
}

export async function updateOriginAllowlist(
  authToken: string,
  appId: string,
  originAllowlist: Array<{ name?: string; value: string }>,
) {
  return sharedUpdateOriginAllowlist(authToken, appId, originAllowlist, MCP_CLIENT_OPTIONS);
}

export async function updateIpAllowlist(
  authToken: string,
  appId: string,
  ipAllowlist: Array<{ name?: string; value: string }>,
) {
  return sharedUpdateIpAllowlist(authToken, appId, ipAllowlist, MCP_CLIENT_OPTIONS);
}

export async function listChains(authToken: string) {
  return sharedListChains(authToken, MCP_CLIENT_OPTIONS);
}
