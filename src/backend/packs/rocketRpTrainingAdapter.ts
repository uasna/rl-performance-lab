import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type RocketRpRunResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RocketRpTrainingAdapterOptions = {
  trainingCliPath: string;
  timeoutMs?: number;
  enforceCrc?: boolean;
};

export type ConvertResult = RocketRpRunResult & {
  outputPath: string;
};

async function assertFileExists(filePath: string, label: string) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  } catch {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function listFilesByExt(dirPath: string, extensions: string[]) {
  const normalizedExts = new Set(extensions.map((ext) => ext.toLowerCase()));

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: Array<{ path: string; mtimeMs: number; size: number }> = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(dirPath, entry.name);
      const ext = path.extname(entry.name).toLowerCase();
      if (!normalizedExts.has(ext)) continue;
      const stat = await fs.stat(fullPath);
      files.push({ path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
    }

    return files;
  } catch {
    return [];
  }
}

function baseNameWithoutExt(filePath: string) {
  return path.basename(filePath, path.extname(filePath)).toLowerCase();
}

async function pickGeneratedFile(params: {
  inputPath: string;
  outputDir: string;
  extensions: string[];
  startedAtMs: number;
  beforePaths: Set<string>;
}) {
  const { inputPath, outputDir, extensions, startedAtMs, beforePaths } = params;
  const inputBase = baseNameWithoutExt(inputPath);
  const candidates = await listFilesByExt(outputDir, extensions);

  const fresh = candidates
    .filter((file) => file.size > 0)
    .filter((file) => file.mtimeMs >= startedAtMs - 1500 || !beforePaths.has(file.path))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const sameBase = fresh.find((file) => baseNameWithoutExt(file.path) === inputBase);
  if (sameBase) return sameBase.path;

  if (fresh.length > 0) return fresh[0].path;

  const allSameBase = candidates
    .filter((file) => file.size > 0)
    .filter((file) => baseNameWithoutExt(file.path) === inputBase)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (allSameBase.length > 0) return allSameBase[0].path;

  throw new Error(
    `RocketRP finished but no output file was found in ${outputDir} for extensions ${extensions.join(", ")}.`
  );
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<RocketRpRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`RocketRP timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const result: RocketRpRunResult = {
        command,
        args,
        stdout,
        stderr,
        exitCode: exitCode ?? -1,
      };

      if (result.exitCode !== 0) {
        reject(
          new Error(
            `RocketRP failed with exit code ${result.exitCode}.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
          )
        );
        return;
      }

      resolve(result);
    });
  });
}

export class RocketRpTrainingAdapter {
  private readonly trainingCliPath: string;
  private readonly timeoutMs: number;
  private readonly enforceCrc: boolean;

  constructor(options: RocketRpTrainingAdapterOptions) {
    this.trainingCliPath = options.trainingCliPath;
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.enforceCrc = options.enforceCrc ?? true;
  }

  async deserializeToJson(trainingFilePath: string, outputDir: string): Promise<ConvertResult> {
    await assertFileExists(this.trainingCliPath, "RocketRP.TrainingCLI");
    await assertFileExists(trainingFilePath, "Training .Tem file");
    await ensureDir(outputDir);

    const before = new Set((await listFilesByExt(outputDir, [".json"])).map((file) => file.path));
    const startedAtMs = Date.now();

    const args = ["-f", trainingFilePath, "-o", outputDir, "-p"];
    if (this.enforceCrc) args.push("-c");

    const result = await runProcess(this.trainingCliPath, args, this.timeoutMs);
    const outputPath = await pickGeneratedFile({
      inputPath: trainingFilePath,
      outputDir,
      extensions: [".json"],
      startedAtMs,
      beforePaths: before,
    });

    return { ...result, outputPath };
  }

  async serializeFromJson(jsonFilePath: string, outputDir: string): Promise<ConvertResult> {
    await assertFileExists(this.trainingCliPath, "RocketRP.TrainingCLI");
    await assertFileExists(jsonFilePath, "Training JSON file");
    await ensureDir(outputDir);

    const before = new Set((await listFilesByExt(outputDir, [".tem"])).map((file) => file.path));
    const startedAtMs = Date.now();

    const args = ["-f", jsonFilePath, "-o", outputDir, "-m", "Serialize"];
    const result = await runProcess(this.trainingCliPath, args, this.timeoutMs);
    const outputPath = await pickGeneratedFile({
      inputPath: jsonFilePath,
      outputDir,
      extensions: [".tem"],
      startedAtMs,
      beforePaths: before,
    });

    return { ...result, outputPath };
  }
}
