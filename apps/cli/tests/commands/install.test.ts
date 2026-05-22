import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALCHEMY_MCP_URL,
  ALCHEMY_SKILLS_PACKAGE,
} from "../../src/commands/install/constants.js";

async function loadInstallCommand() {
  const printJSON = vi.fn();
  const exitWithError = vi.fn((err: unknown) => {
    throw err;
  });

  vi.doMock("../../src/lib/output.js", () => ({
    isJSONMode: () => true,
    printJSON,
    quiet: false,
  }));
  vi.doMock("../../src/lib/ui.js", () => ({
    brand: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
  }));
  vi.doMock("../../src/lib/interaction.js", () => ({
    isInteractiveAllowed: () => false,
  }));
  vi.doMock("../../src/lib/terminal-ui.js", () => ({
    promptMultiselect: vi.fn(),
  }));
  vi.doMock("../../src/lib/errors.js", async () => ({
    ...(await vi.importActual("../../src/lib/errors.js")),
    exitWithError,
  }));

  const { registerInstall } = await import("../../src/commands/install/index.js");
  return { registerInstall, printJSON, exitWithError };
}

async function runInstallCommand(args: string[]) {
  const loaded = await loadInstallCommand();
  const program = new Command();
  loaded.registerInstall(program);
  await program.parseAsync(["node", "test", ...args], { from: "node" });
  return loaded;
}

describe("install commands", () => {
  const originalHome = process.env.HOME;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    process.env.PATH = "";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
  });

  it("installs Cursor MCP config without removing existing servers", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;
    const cursorDir = join(home, ".cursor");
    const configPath = join(cursorDir, "mcp.json");
    await mkdir(cursorDir, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          existing: {
            url: "https://example.com/mcp",
          },
        },
      }),
    );

    const { printJSON } = await runInstallCommand([
      "install",
      "mcp",
      "--client",
      "cursor",
    ]);

    const saved = JSON.parse(await readFile(configPath, "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(saved.mcpServers.existing).toEqual({
      url: "https://example.com/mcp",
    });
    expect(saved.mcpServers.alchemy).toEqual({
      type: "streamable-http",
      url: ALCHEMY_MCP_URL,
    });
    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "mcp",
        dryRun: false,
        mcpUrl: ALCHEMY_MCP_URL,
      }),
    );
  });

  it("installs Codex MCP with the Codex CLI", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;
    const binDir = join(home, "bin");
    const callsPath = join(home, "codex-args.json");
    const codexPath = join(binDir, "codex");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      codexPath,
      [
        "#!/usr/bin/env node",
        'const { writeFileSync } = require("node:fs");',
        `writeFileSync(${JSON.stringify(callsPath)}, JSON.stringify(process.argv.slice(2)));`,
      ].join("\n"),
    );
    await chmod(codexPath, 0o755);
    process.env.PATH = [binDir, originalPath].filter(Boolean).join(delimiter);

    const { printJSON } = await runInstallCommand([
      "install",
      "mcp",
      "--client",
      "codex",
    ]);

    expect(JSON.parse(await readFile(callsPath, "utf8"))).toEqual([
      "mcp",
      "add",
      "alchemy",
      "--url",
      ALCHEMY_MCP_URL,
    ]);
    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        clients: [
          expect.objectContaining({
            client: "codex",
            command: `codex mcp add alchemy --url ${ALCHEMY_MCP_URL}`,
          }),
        ],
      }),
    );
  });

  it("previews skills installs with the selected clients", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;

    const { printJSON } = await runInstallCommand([
      "install",
      "skills",
      "--client",
      "claude,cursor",
      "--dry-run",
    ]);

    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "skills",
        dryRun: true,
        clients: [
          expect.objectContaining({
            client: "claude",
            path: "~/.claude/skills/",
            command: expect.stringContaining("--agent claude-code --agent cursor"),
          }),
          expect.objectContaining({
            client: "cursor",
            path: "~/.cursor/skills/",
            command: expect.stringContaining("--agent claude-code --agent cursor"),
          }),
        ],
      }),
    );
  });

  it("runs skills installer with repeated agent flags", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;
    const binDir = join(home, "bin");
    const callsPath = join(home, "npx-args.json");
    const npxPath = join(binDir, "npx");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      npxPath,
      [
        "#!/usr/bin/env node",
        'const { writeFileSync } = require("node:fs");',
        `writeFileSync(${JSON.stringify(callsPath)}, JSON.stringify(process.argv.slice(2)));`,
      ].join("\n"),
    );
    await chmod(npxPath, 0o755);
    process.env.PATH = [binDir, originalPath].filter(Boolean).join(delimiter);

    await runInstallCommand(["install", "skills", "--client", "all"]);

    expect(JSON.parse(await readFile(callsPath, "utf8"))).toEqual([
      "-y",
      "skills@latest",
      "add",
      ALCHEMY_SKILLS_PACKAGE,
      "--global",
      "--copy",
      "--yes",
      "--skill",
      "*",
      "--agent",
      "claude-code",
      "--agent",
      "cursor",
      "--agent",
      "codex",
    ]);
  });

  it("prints copyable MCP config for other clients", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;

    const { printJSON } = await runInstallCommand([
      "install",
      "mcp",
      "--client",
      "other",
    ]);

    expect(printJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "mcp",
        dryRun: false,
        clients: [
          expect.objectContaining({
            client: "other",
            status: "manual",
            config: {
              json: {
                mcpServers: {
                  alchemy: {
                    type: "streamable-http",
                    url: ALCHEMY_MCP_URL,
                  },
                },
              },
              toml: `[mcp_servers.alchemy]\nurl = "${ALCHEMY_MCP_URL}"\n`,
            },
          }),
        ],
      }),
    );
  });

  it("rejects unknown clients", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;

    await expect(
      runInstallCommand(["install", "mcp", "--client", "windsurf"]),
    ).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message:
        "Unknown client 'windsurf'. Use claude, cursor, codex, other, or all.",
    });
  });

  it("rejects other clients for skills", async () => {
    const home = await mkdtemp(join(tmpdir(), "alchemy-install-"));
    process.env.HOME = home;

    await expect(
      runInstallCommand(["install", "skills", "--client", "other"]),
    ).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message: "Unknown client 'other'. Use claude, cursor, codex, or all.",
    });
  });
});
