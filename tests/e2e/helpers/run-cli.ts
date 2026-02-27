import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface RunCLIResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  homeDir: string;
}

export async function runCLI(
  args: string[],
  env: Record<string, string> = {},
): Promise<RunCLIResult> {
  const homeDir = mkdtempSync(join(tmpdir(), "alchemy-cli-e2e-"));
  const child = spawn(process.execPath, ["dist/index.js", ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: homeDir,
      NO_COLOR: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  return {
    exitCode,
    stdout,
    stderr,
    homeDir,
  };
}
