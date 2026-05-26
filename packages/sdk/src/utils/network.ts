const NETWORK_RE = /^[a-z0-9-]+$/;

export function isSafeNetworkIdentifier(network: string): boolean {
  return NETWORK_RE.test(network);
}
