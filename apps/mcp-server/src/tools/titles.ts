/**
 * Human-readable tool titles for MCP tool annotations.
 *
 * The Claude Connectors Directory requires every tool to expose a `title`
 * annotation alongside its `readOnlyHint`/`destructiveHint`. Rather than
 * declaring a title at each of the ~160 registration sites, titles are derived
 * from the tool name here and injected centrally by `createInstrumentedServer`.
 *
 * `humanizeToolName` splits camelCase / snake_case identifiers into words and
 * preserves common blockchain acronyms (ETH, NFT, RPC, ...). Use
 * `TOOL_TITLE_OVERRIDES` only when the derived title reads poorly.
 */

/** Words that should render fully uppercased (e.g. eth -> ETH, nft -> NFT). */
const ACRONYMS = new Set([
  "eth",
  "erc",
  "nft",
  "rpc",
  "evm",
  "das",
  "usd",
  "ip",
  "id",
  "eip",
  "uo",
  "tps",
  "api",
  "url",
  "sol",
  "spl",
  "sha3",
]);

function splitWords(name: string): string[] {
  return name
    .replace(/_/g, " ")
    // boundary between a lowercase/digit and an uppercase letter: aB -> a B
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // boundary between an acronym run and a following capitalized word:
    // NFTMetadata -> NFT Metadata. Requires 2+ trailing lowercase letters so a
    // pluralizing "s" stays attached to its acronym (NFTs stays NFTs).
    .replace(/([A-Z]+)([A-Z][a-z]{2,})/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function formatWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return word.toUpperCase();
  // Pluralized acronym keeps a lowercase trailing "s": nfts -> NFTs, urls -> URLs.
  if (lower.endsWith("s") && ACRONYMS.has(lower.slice(0, -1))) {
    return `${lower.slice(0, -1).toUpperCase()}s`;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Derive a Title Case display name from a tool's machine name. */
export function humanizeToolName(name: string): string {
  return splitWords(name).map(formatWord).join(" ");
}

/** Explicit titles for tools whose derived title reads poorly. */
export const TOOL_TITLE_OVERRIDES: Record<string, string> = {
  ping: "Ping",
};

/** Resolve the display title for a tool name. */
export function toolTitle(name: string): string {
  return TOOL_TITLE_OVERRIDES[name] ?? humanizeToolName(name);
}
