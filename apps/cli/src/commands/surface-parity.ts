import { Command } from "commander";
import {
  DATA_API_SURFACE,
  RPC_API_SURFACE,
  type DataApiSurfaceMethod,
  type DataQueryParams,
  DataApiError,
  createAlchemyDataClient,
  globalRpcCall,
  RpcApiError,
  type RpcApiSurfaceMethod,
} from "@alchemy/sdk";
import {
  clientFromFlags,
  resolveAPIKey,
  resolveNetwork,
  resolveSolanaNetwork,
} from "../lib/resolve.js";
import {
  errAuthRequired,
  errInvalidAPIKey,
  errInvalidArgs,
  errNetwork,
  errRPC,
  errRateLimited,
  exitWithError,
} from "../lib/errors.js";
import { parseRequiredJSON } from "../lib/params.js";
import { timeout as globalTimeout } from "../lib/output.js";
import { printSyntaxJSON, withSpinner } from "../lib/ui.js";
import {
  callSolana,
  normalizeSolanaDasPaywallError,
  solanaRpcFamilyForMethod,
} from "../lib/solana-rpc.js";

type RpcParams = unknown[] | Record<string, unknown>;
type DataObject = Record<string, unknown>;
type DataMethod = (...args: unknown[]) => Promise<unknown>;

interface RpcCommandOptions {
  params: string;
}

interface DataCommandOptions {
  query?: string;
  body?: string;
}

interface RpcRegistrationArgs {
  root: Command;
  parent: Command;
  method: RpcApiSurfaceMethod;
}

export function registerEvmRpcSurfaceCommands(root: Command, rpc: Command): void {
  for (const method of RPC_API_SURFACE.filter((entry) => entry.family === "evm")) {
    registerRpcSurfaceCommand({ root, parent: rpc, method });
  }
}

export function registerSolanaRpcSurfaceCommands(root: Command, solana: Command): void {
  for (const method of RPC_API_SURFACE.filter((entry) => entry.family === "solana")) {
    registerRpcSurfaceCommand({ root, parent: solana, method });
  }
}

export function registerDataSurfaceCommands(root: Command, data: Command): void {
  for (const method of DATA_API_SURFACE) {
    const command = data
      .command(method.name)
      .description(`Call ${method.name}`);

    if (method.input === "query") {
      command.option("--query <json>", "Query parameters as a JSON object", "{}");
    } else if (method.input === "body") {
      command.option("--body <json>", "Request body as a JSON object", "{}");
    }

    command.action(async (opts: DataCommandOptions) => {
      try {
        const apiKey = resolveAPIKey(root);
        if (!apiKey) {
          throw errAuthRequired();
        }
        const client = createAlchemyDataClient(apiKey, { breadcrumb: "alchemy-cli" });
        const result = await withSpinner(`Calling ${method.name}...`, `Called ${method.name}`, () =>
          callDataMethod(client, method, root, opts),
        );
        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(mapDataError(err));
      }
    });
  }
}

function registerRpcSurfaceCommand({ root, parent, method }: RpcRegistrationArgs): void {
  parent
    .command(method.name)
    .description(`Call ${method.rpcMethod}`)
    .option("--params <json>", "JSON-RPC params as an array or object", "[]")
    .action(async (opts: RpcCommandOptions) => {
      try {
        const params = parseRpcParams(opts.params);
        let result: unknown;

        if (method.gateway === "global") {
          const apiKey = resolveAPIKey(root);
          if (!apiKey) {
            throw errAuthRequired();
          }
          if (!Array.isArray(params)) {
            throw errInvalidArgs("--params must be a JSON array for global RPC methods.");
          }
          result = await withSpinner(`Calling ${method.name}...`, `Called ${method.name}`, () =>
            globalRpcCall(apiKey, method.rpcMethod, params, {
              breadcrumb: "alchemy-cli",
              ...(globalTimeout && { timeoutMs: globalTimeout }),
            }),
          );
        } else {
          const client = method.family === "solana"
            ? clientFromFlags(root, { forceNetwork: resolveSolanaNetwork(root) })
            : clientFromFlags(root);
          result = await withSpinner(`Calling ${method.name}...`, `Called ${method.name}`, () =>
            callNetworkRpcMethod(client, method, params),
          );
        }

        printSyntaxJSON(result);
      } catch (err) {
        exitWithError(mapRpcError(err));
      }
    });
}

async function callNetworkRpcMethod(
  client: { call(method: string, params: unknown): Promise<unknown> },
  method: RpcApiSurfaceMethod,
  params: RpcParams,
): Promise<unknown> {
  if (method.family !== "solana") {
    return await client.call(method.rpcMethod, params);
  }

  const solanaFamily = solanaRpcFamilyForMethod(method.rpcMethod);
  try {
    return await callSolana(client, solanaFamily, method.rpcMethod, params);
  } catch (err) {
    if (solanaFamily === "das") {
      throw normalizeSolanaDasPaywallError(err) ?? err;
    }
    throw err;
  }
}

function parseRpcParams(input: string): RpcParams {
  const parsed = parseRequiredJSON<unknown>(input, "--params");
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw errInvalidArgs("--params must be a JSON array or object.");
}

async function callDataMethod(
  client: ReturnType<typeof createAlchemyDataClient>,
  method: DataApiSurfaceMethod,
  root: Command,
  opts: DataCommandOptions,
): Promise<unknown> {
  if (method.service === "nft") {
    const fn = client.nft[method.sdkMethod as keyof typeof client.nft] as unknown as DataMethod;
    const network = resolveNetwork(root);
    if (method.input === "none") {
      return await fn.call(client.nft, network);
    }
    if (method.input === "body") {
      return await fn.call(client.nft, network, parseDataObject(opts.body ?? "{}", "--body"));
    }
    return await fn.call(client.nft, network, normalizeQuery(parseDataObject(opts.query ?? "{}", "--query")));
  }

  if (method.service === "prices") {
    const fn = client.prices[method.sdkMethod as keyof typeof client.prices] as unknown as DataMethod;
    if (method.input === "body") {
      return await fn.call(client.prices, parseDataObject(opts.body ?? "{}", "--body"));
    }
    return await fn.call(client.prices, parseDataObject(opts.query ?? "{}", "--query"));
  }

  const fn = client.portfolio[method.sdkMethod as keyof typeof client.portfolio] as unknown as DataMethod;
  return await fn.call(client.portfolio, parseDataObject(opts.body ?? "{}", "--body"));
}

function parseDataObject(input: string, label: string): DataObject {
  const parsed = parseRequiredJSON<unknown>(input, label);
  if (isPlainObject(parsed)) {
    return parsed;
  }
  throw errInvalidArgs(`${label} must be a JSON object.`);
}

function normalizeQuery(input: DataObject): DataQueryParams {
  const out: DataQueryParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.map((item) => String(item));
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is DataObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapRpcError(err: unknown): unknown {
  if (!(err instanceof RpcApiError)) {
    return err;
  }
  if (err.status === 429) {
    return errRateLimited();
  }
  if (err.status === 401 || err.status === 403) {
    return errInvalidAPIKey(err.message);
  }
  if (err.status !== undefined) {
    return errNetwork(`HTTP ${err.status}: ${err.message}`);
  }
  return errRPC(err.code, err.message);
}

function mapDataError(err: unknown): unknown {
  if (!(err instanceof DataApiError)) {
    return err;
  }
  if (err.status === 429) {
    return errRateLimited();
  }
  if (err.status === 401 || err.status === 403) {
    return errInvalidAPIKey(err.message);
  }
  return errNetwork(`HTTP ${err.status}: ${err.message}`);
}
