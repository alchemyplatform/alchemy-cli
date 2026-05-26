export const DEFAULT_ALCHEMY_BASE_DOMAIN = "alchemy.com";

function readEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}

export interface AlchemyApiConfig {
  baseDomain?: string;
  adminApiBaseUrl?: string;
  gasManagerApiBaseUrl?: string;
  notifyApiBaseUrl?: string;
}

export function getAlchemyBaseDomain(config: AlchemyApiConfig = {}): string {
  return config.baseDomain ?? readEnv("ALCHEMY_BASE_DOMAIN") ?? DEFAULT_ALCHEMY_BASE_DOMAIN;
}

export function getGatewayDomain(config: AlchemyApiConfig = {}): string {
  return `g.${getAlchemyBaseDomain(config)}`;
}

export function getAdminApiBaseUrl(config: AlchemyApiConfig = {}): string {
  const baseUrl = config.adminApiBaseUrl ?? readEnv("ALCHEMY_ADMIN_API_BASE_URL");
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  return `https://admin-api.${getAlchemyBaseDomain(config)}`;
}

export function getGasManagerApiBaseUrl(config: AlchemyApiConfig = {}): string {
  const baseUrl = config.gasManagerApiBaseUrl ?? readEnv("ALCHEMY_GAS_MANAGER_BASE_URL");
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  return `https://manage.g.${getAlchemyBaseDomain(config)}`;
}

export function getNotifyApiBaseUrl(config: AlchemyApiConfig = {}): string {
  const baseUrl = config.notifyApiBaseUrl ?? readEnv("ALCHEMY_NOTIFY_API_BASE_URL");
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  return `https://dashboard.${getAlchemyBaseDomain(config)}/api`;
}
