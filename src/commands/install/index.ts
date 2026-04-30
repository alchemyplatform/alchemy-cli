import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { Command } from "commander";
import { isInteractiveAllowed } from "../../lib/interaction.js";
import { isJSONMode, printJSON, quiet } from "../../lib/output.js";
import { promptMultiselect, type PromptOption } from "../../lib/terminal-ui.js";
import { brand, dim, green, yellow } from "../../lib/ui.js";
import {
  CLIError,
  ErrorCode,
  errInvalidArgs,
  exitWithError,
} from "../../lib/errors.js";
import { ALCHEMY_MCP_URL, ALCHEMY_SKILLS_PACKAGE } from "./constants.js";

const CLIENTS = [
  {
    id: "claude",
    label: "Claude Code",
    skillAgent: "claude-code",
    skillsPath: "~/.claude/skills/",
  },
  {
    id: "cursor",
    label: "Cursor",
    skillAgent: "cursor",
    skillsPath: "~/.cursor/skills/",
  },
  {
    id: "codex",
    label: "Codex",
    skillAgent: "codex",
    skillsPath: "~/.codex/skills/",
  },
] as const;

type ClientId = (typeof CLIENTS)[number]["id"];
type McpClientId = ClientId | "other";
type InstallKind = "mcp" | "skills";

interface ClientStatus {
  id: McpClientId;
  label: string;
  detected: boolean;
  hint?: string;
}

interface InstallResult {
  client: McpClientId;
  label: string;
  detected: boolean;
  status: "installed" | "planned" | "manual";
  path?: string;
  command?: string;
  config?: {
    json: Record<string, unknown>;
    toml: string;
  };
}

function getHomeDir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function expandHome(path: string): string {
  if (path === "~") return getHomeDir();
  if (path.startsWith("~/")) return join(getHomeDir(), path.slice(2));
  return path;
}

function displayPath(path: string): string {
  const home = getHomeDir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClientId(value: McpClientId): value is ClientId {
  return CLIENTS.some((client) => client.id === value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(command: string): Promise<string | undefined> {
  const pathValue = process.env.PATH;
  if (!pathValue) return undefined;

  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = join(dir, `${command}${ext}`);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep scanning PATH.
      }
    }
  }

  return undefined;
}

async function detectClients(kind: InstallKind): Promise<ClientStatus[]> {
  const home = getHomeDir();
  const [
    claudeBin,
    cursorBin,
    codexBin,
    claudeDir,
    cursorDir,
    cursorGlobalApp,
    cursorUserApp,
    codexDir,
  ] = await Promise.all([
    findExecutable("claude"),
    findExecutable("cursor"),
    findExecutable("codex"),
    pathExists(join(home, ".claude")),
    pathExists(join(home, ".cursor")),
    pathExists("/Applications/Cursor.app"),
    pathExists(join(home, "Applications", "Cursor.app")),
    pathExists(join(home, ".codex")),
  ]);

  const statuses = CLIENTS.map((client): ClientStatus => {
    const detected =
      client.id === "claude"
        ? kind === "mcp"
          ? Boolean(claudeBin)
          : Boolean(claudeBin || claudeDir)
        : client.id === "cursor"
          ? Boolean(cursorBin || cursorDir || cursorGlobalApp || cursorUserApp)
          : Boolean(codexBin || codexDir);
    return {
      id: client.id,
      label: client.label,
      detected,
    };
  });
  if (kind === "mcp") {
    statuses.push({
      id: "other",
      label: "Other MCP client",
      detected: false,
      hint: "copy config",
    });
  }
  return statuses;
}

function parseClientList(
  raw: string | undefined,
  kind: InstallKind,
): McpClientId[] | undefined {
  if (raw === undefined) return undefined;

  const values = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (values.length === 0) {
    throw errInvalidArgs("Expected at least one client.");
  }

  if (values.includes("all")) {
    return CLIENTS.map((client) => client.id);
  }

  const parsed: McpClientId[] = [];
  for (const value of values) {
    const normalized = value === "claude-code" ? "claude" : value;
    const match = CLIENTS.find((client) => client.id === normalized);
    if (match) {
      if (!parsed.includes(match.id)) {
        parsed.push(match.id);
      }
      continue;
    }
    if (kind === "mcp" && normalized === "other") {
      if (!parsed.includes("other")) {
        parsed.push("other");
      }
      continue;
    }
    if (kind === "mcp") {
      throw errInvalidArgs(
        `Unknown client '${value}'. Use claude, cursor, codex, other, or all.`,
      );
    }
    throw errInvalidArgs(
      `Unknown client '${value}'. Use claude, cursor, codex, or all.`,
    );
  }

  return parsed;
}

function clientById(id: ClientId): (typeof CLIENTS)[number] {
  return CLIENTS.find((client) => client.id === id)!;
}

function formatDetectedClients(statuses: ClientStatus[]): string {
  const detected = statuses
    .filter((status) => status.detected)
    .map((status) => status.label);
  return detected.length > 0 ? detected.join(", ") : "none";
}

async function resolveTargetClients(args: {
  client?: string;
  kind: InstallKind;
  program: Command;
  statuses: ClientStatus[];
}): Promise<McpClientId[] | null> {
  const parsed = parseClientList(args.client, args.kind);
  if (parsed) return parsed;

  if (!isInteractiveAllowed(args.program)) {
    throw errInvalidArgs(
      args.kind === "mcp"
        ? "Use --client claude,cursor,codex,other or --client all in non-interactive mode."
        : "Use --client claude,cursor,codex or --client all in non-interactive mode.",
    );
  }

  console.log(
    `  ${dim("Detected clients:")} ${formatDetectedClients(args.statuses)}`,
  );

  const options: PromptOption<McpClientId>[] = args.statuses.map((status) => ({
    value: status.id,
    label: status.label,
    hint: status.hint ?? (status.detected ? "detected" : "not detected"),
  }));
  const initialValues = args.statuses
    .filter((status) => status.detected)
    .map((status) => status.id);

  const selected = await promptMultiselect({
    message:
      args.kind === "mcp"
        ? "Install MCP for which clients?"
        : "Install all Alchemy skills for which clients?",
    options,
    initialValues,
    required: true,
    cancelMessage: "Cancelled install.",
  });

  return selected;
}

function commandString(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

async function runCommand(args: {
  command: string;
  argv: string[];
  label: string;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(args.command, args.argv, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          errInvalidArgs(
            `${args.label} command not found. Install the client or select another client.`,
          ),
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CLIError(
          ErrorCode.INTERNAL_ERROR,
          `${args.label} install failed.`,
          undefined,
          (stderr || stdout).trim() ||
            `Command exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

async function readJSONConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.trim().length === 0) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw errInvalidArgs(`${displayPath(path)} must contain a JSON object.`);
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (err instanceof SyntaxError) {
      throw errInvalidArgs(`Could not parse ${displayPath(path)} as JSON.`);
    }
    throw err;
  }
}

function withMcpServerConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const existing = config.mcpServers;
  if (existing !== undefined && !isRecord(existing)) {
    throw errInvalidArgs("Cursor mcpServers must be a JSON object.");
  }

  return {
    ...config,
    mcpServers: {
      ...(existing ?? {}),
      alchemy: {
        type: "streamable-http",
        url: ALCHEMY_MCP_URL,
      },
    },
  };
}

async function installCursorMcp(dryRun: boolean): Promise<InstallResult> {
  const path = expandHome("~/.cursor/mcp.json");
  const result: InstallResult = {
    client: "cursor",
    label: "Cursor",
    detected: await pathExists(dirname(path)),
    status: dryRun ? "planned" : "installed",
    path: displayPath(path),
  };
  if (dryRun) return result;

  const config = withMcpServerConfig(await readJSONConfig(path));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return result;
}

function genericMcpJSONConfig(): Record<string, unknown> {
  return withMcpServerConfig({});
}

function codexMcpBlock(): string {
  return `[mcp_servers.alchemy]\nurl = "${ALCHEMY_MCP_URL}"\n`;
}

async function installCodexMcp(dryRun: boolean): Promise<InstallResult> {
  const argv = ["mcp", "add", "alchemy", "--url", ALCHEMY_MCP_URL];
  const result: InstallResult = {
    client: "codex",
    label: "Codex",
    detected: Boolean(await findExecutable("codex")),
    status: dryRun ? "planned" : "installed",
    command: commandString("codex", argv),
  };
  if (dryRun) return result;

  await runCommand({ command: "codex", argv, label: "Codex" });
  return result;
}

async function installClaudeMcp(dryRun: boolean): Promise<InstallResult> {
  const argv = [
    "mcp",
    "add",
    "--transport",
    "http",
    "--scope",
    "user",
    "alchemy",
    ALCHEMY_MCP_URL,
  ];
  const result: InstallResult = {
    client: "claude",
    label: "Claude Code",
    detected: Boolean(await findExecutable("claude")),
    status: dryRun ? "planned" : "installed",
    command: commandString("claude", argv),
  };
  if (!dryRun) {
    await runCommand({ command: "claude", argv, label: "Claude Code" });
  }
  return result;
}

function installOtherMcp(): InstallResult {
  return {
    client: "other",
    label: "Other MCP client",
    detected: false,
    status: "manual",
    config: {
      json: genericMcpJSONConfig(),
      toml: codexMcpBlock(),
    },
  };
}

async function installMcpClient(
  client: McpClientId,
  dryRun: boolean,
): Promise<InstallResult> {
  if (client === "claude") return installClaudeMcp(dryRun);
  if (client === "cursor") return installCursorMcp(dryRun);
  if (client === "other") return installOtherMcp();
  return installCodexMcp(dryRun);
}

function skillsCommand(clients: ClientId[]): { command: string; argv: string[] } {
  const agents = clients.map((client) => clientById(client).skillAgent);
  const agentArgs = agents.flatMap((agent) => ["--agent", agent]);
  return {
    command: "npx",
    argv: [
      "-y",
      "skills@latest",
      "add",
      ALCHEMY_SKILLS_PACKAGE,
      "--global",
      "--copy",
      "--yes",
      "--skill",
      "*",
      ...agentArgs,
    ],
  };
}

async function installSkillsClients(args: {
  clients: ClientId[];
  dryRun: boolean;
  statuses: ClientStatus[];
}): Promise<InstallResult[]> {
  const command = skillsCommand(args.clients);
  if (!args.dryRun) {
    await runCommand({
      command: command.command,
      argv: command.argv,
      label: "Skills",
    });
  }

  return args.clients.map((client) => {
    const meta = clientById(client);
    const status = args.statuses.find((entry) => entry.id === client);
    return {
      client,
      label: meta.label,
      detected: status?.detected ?? false,
      status: args.dryRun ? "planned" : "installed",
      path: meta.skillsPath,
      command: commandString(command.command, command.argv),
    };
  });
}

function printHumanSummary(args: {
  kind: InstallKind;
  dryRun: boolean;
  results: InstallResult[];
}): void {
  if (quiet || isJSONMode()) return;

  const title = args.kind === "mcp" ? "MCP" : "Skills";
  console.log(`  ${brand("◆")} ${title}`);
  for (const result of args.results) {
    const marker =
      result.status === "manual" || args.dryRun ? yellow("◆") : green("✓");
    const verb =
      result.status === "manual"
        ? "Copy config for"
        : args.dryRun
          ? "Would install"
          : "Installed";
    const target =
      result.status === "manual"
        ? undefined
        : result.path ?? result.command ?? result.label;
    console.log(
      `  ${marker} ${verb} ${result.label}${
        target ? ` ${dim(`(${target})`)}` : ""
      }`,
    );
    if (result.config) {
      console.log(`  ${dim("JSON")}`);
      for (const line of JSON.stringify(result.config.json, null, 2).split(
        "\n",
      )) {
        console.log(`  ${line}`);
      }
      console.log(`  ${dim("TOML")}`);
      for (const line of result.config.toml.trimEnd().split("\n")) {
        console.log(`  ${line}`);
      }
    }
  }
}

function printJSONSummary(args: {
  kind: InstallKind;
  dryRun: boolean;
  results: InstallResult[];
}): void {
  if (!isJSONMode()) return;
  printJSON({
    target: args.kind,
    dryRun: args.dryRun,
    ...(args.kind === "mcp" && { mcpUrl: ALCHEMY_MCP_URL }),
    clients: args.results,
  });
}

async function runInstallMcp(args: {
  client?: string;
  dryRun: boolean;
  program: Command;
}): Promise<void> {
  const statuses = await detectClients("mcp");
  const clients = await resolveTargetClients({
    client: args.client,
    kind: "mcp",
    program: args.program,
    statuses,
  });
  if (!clients || clients.length === 0) return;

  const results: InstallResult[] = [];
  for (const client of clients) {
    const result = await installMcpClient(client, args.dryRun);
    const status = statuses.find((entry) => entry.id === client);
    results.push({ ...result, detected: status?.detected ?? result.detected });
  }
  printJSONSummary({ kind: "mcp", dryRun: args.dryRun, results });
  printHumanSummary({ kind: "mcp", dryRun: args.dryRun, results });
}

async function runInstallSkills(args: {
  client?: string;
  dryRun: boolean;
  program: Command;
}): Promise<void> {
  const statuses = await detectClients("skills");
  const clients = await resolveTargetClients({
    client: args.client,
    kind: "skills",
    program: args.program,
    statuses,
  });
  if (!clients || clients.length === 0) return;

  const results = await installSkillsClients({
    clients: clients.filter(isClientId),
    dryRun: args.dryRun,
    statuses,
  });
  printJSONSummary({ kind: "skills", dryRun: args.dryRun, results });
  printHumanSummary({ kind: "skills", dryRun: args.dryRun, results });
}

export function registerInstall(program: Command) {
  const cmd = program
    .command("install")
    .description("Install Alchemy MCP and skills into agent clients");

  cmd
    .command("mcp")
    .description("Install Alchemy's remote MCP server")
    .option(
      "--client <clients>",
      "Target clients: claude, cursor, codex, other, or all",
    )
    .option("--dry-run", "Preview changes without writing client config")
    .action(async (opts: { client?: string; dryRun?: boolean }) => {
      try {
        await runInstallMcp({
          client: opts.client,
          dryRun: Boolean(opts.dryRun),
          program,
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  cmd
    .command("skills")
    .description("Install Alchemy skills")
    .option("--client <clients>", "Target clients: claude, cursor, codex, or all")
    .option("--dry-run", "Preview changes without writing skill files")
    .action(async (opts: { client?: string; dryRun?: boolean }) => {
      try {
        await runInstallSkills({
          client: opts.client,
          dryRun: Boolean(opts.dryRun),
          program,
        });
      } catch (err) {
        exitWithError(err);
      }
    });
}
