import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { deepClone, assertOnlyAllowedJsonPathsChanged } from "./jsonPatchGuard";
import { RocketRpTrainingAdapter } from "./rocketRpTrainingAdapter";
import {
  readJsonFile,
  validateTemFile,
  validateTrainingJsonFile,
  validateTrainingJsonObject,
  type TrainingJsonValidation,
} from "./safePackValidator";

export type SafePackPatchContext = {
  originalJsonPath: string;
  originalShotCount: number;
  originalShotPath?: string;
};

export type SafePackPatchFn = (
  decodedTemplate: unknown,
  context: SafePackPatchContext
) => unknown | Promise<unknown>;

export type SafeWriteTrainingPackInput = {
  trainingCliPath: string;
  templateTemPath: string;
  stagingRootDir: string;
  installDir: string;
  outputFileName?: string;
  expectedMinShots?: number;
  preserveShotCount?: boolean;
  minimumTemSizeBytes?: number;
  allowedPatchPathPrefixes?: string[];
  patch?: SafePackPatchFn;
};

export type SafeWriteTrainingPackResult = {
  installed: true;
  finalPath: string;
  generatedTemPath: string;
  runDir: string;
  original: TrainingJsonValidation;
  patched: TrainingJsonValidation;
  generated: TrainingJsonValidation;
};

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonFile(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function createRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${stamp}-${suffix}`;
}

function createTrainingFileName() {
  return `${crypto.randomUUID().replace(/-/g, "").toUpperCase()}.Tem`;
}

async function copyIntoInstallDirAtomically(sourcePath: string, finalPath: string) {
  const tempPath = `${finalPath}.rla_tmp`;
  await fs.copyFile(sourcePath, tempPath);

  try {
    await fs.rename(tempPath, finalPath);
  } catch {
    await fs.rm(finalPath, { force: true });
    await fs.rename(tempPath, finalPath);
  }
}

function rejectIfInvalid(label: string, validation: { ok: boolean; reason?: string }) {
  if (!validation.ok) {
    throw new Error(`${label} rejected: ${validation.reason ?? "Unknown validation error."}`);
  }
}

export async function safeWriteTrainingPack(
  input: SafeWriteTrainingPackInput
): Promise<SafeWriteTrainingPackResult> {
  const expectedMinShots = input.expectedMinShots ?? 1;
  const preserveShotCount = input.preserveShotCount ?? true;
  const minimumTemSizeBytes = input.minimumTemSizeBytes ?? 1024;
  const outputFileName = input.outputFileName ?? createTrainingFileName();

  if (!/\.tem$/i.test(outputFileName)) {
    throw new Error(`outputFileName must end with .Tem or .tem: ${outputFileName}`);
  }

  await ensureDir(input.stagingRootDir);
  await ensureDir(input.installDir);

  const runDir = path.join(input.stagingRootDir, createRunId());
  const decodeOriginalDir = path.join(runDir, "01-template-decode");
  const patchedDir = path.join(runDir, "02-patched-json");
  const encodeDir = path.join(runDir, "03-generated-tem");
  const redecodeDir = path.join(runDir, "04-generated-redecode");

  await Promise.all([
    ensureDir(decodeOriginalDir),
    ensureDir(patchedDir),
    ensureDir(encodeDir),
    ensureDir(redecodeDir),
  ]);

  const adapter = new RocketRpTrainingAdapter({
    trainingCliPath: input.trainingCliPath,
    enforceCrc: true,
  });

  // 1. Decode original template.
  const originalDecode = await adapter.deserializeToJson(input.templateTemPath, decodeOriginalDir);
  const originalValidation = await validateTrainingJsonFile(originalDecode.outputPath, expectedMinShots);
  rejectIfInvalid("Template", originalValidation);

  // 2. Patch only confirmed fields. Default is pure roundtrip: no mutations.
  const originalJson = await readJsonFile(originalDecode.outputPath);
  const workingCopy = deepClone(originalJson);
  const patchedJson = input.patch
    ? await input.patch(workingCopy, {
        originalJsonPath: originalDecode.outputPath,
        originalShotCount: originalValidation.shots,
        originalShotPath: originalValidation.shotPath,
      })
    : workingCopy;

  const allowedPatchPathPrefixes = input.allowedPatchPathPrefixes ?? [];
  assertOnlyAllowedJsonPathsChanged({
    before: originalJson,
    after: patchedJson,
    allowedPathPrefixes: allowedPatchPathPrefixes,
  });

  const patchedJsonPath = path.join(patchedDir, "patched.training.json");
  await writeJsonFile(patchedJsonPath, patchedJson);

  const patchedValidation = validateTrainingJsonObject(patchedJson, expectedMinShots);
  rejectIfInvalid("Patched JSON", patchedValidation);

  if (preserveShotCount && patchedValidation.shots !== originalValidation.shots) {
    throw new Error(
      `Patched JSON rejected: shot count changed from ${originalValidation.shots} to ${patchedValidation.shots}.`
    );
  }

  // 3. Serialize into staging only. Never install this directly.
  const serialized = await adapter.serializeFromJson(patchedJsonPath, encodeDir);
  const generatedTemValidation = await validateTemFile(serialized.outputPath, minimumTemSizeBytes);
  rejectIfInvalid("Serialized .Tem", generatedTemValidation);

  const generatedTemPath = path.join(encodeDir, outputFileName);
  if (path.resolve(serialized.outputPath) !== path.resolve(generatedTemPath)) {
    await fs.copyFile(serialized.outputPath, generatedTemPath);
  }

  // 4. Re-decode generated .Tem.
  const generatedDecode = await adapter.deserializeToJson(generatedTemPath, redecodeDir);
  const generatedValidation = await validateTrainingJsonFile(generatedDecode.outputPath, expectedMinShots);
  rejectIfInvalid("Re-decoded generated .Tem", generatedValidation);

  // 5. Hard block for 0/0 shots.
  if (generatedValidation.shots <= 0) {
    throw new Error("BLOCKED: generated pack has 0 shots after re-decode.");
  }

  if (preserveShotCount && generatedValidation.shots !== originalValidation.shots) {
    throw new Error(
      `Generated .Tem rejected: shot count changed from ${originalValidation.shots} to ${generatedValidation.shots}.`
    );
  }

  // 6. Only now install.
  const finalPath = path.join(input.installDir, outputFileName);
  await copyIntoInstallDirAtomically(generatedTemPath, finalPath);

  return {
    installed: true,
    finalPath,
    generatedTemPath,
    runDir,
    original: originalValidation,
    patched: patchedValidation,
    generated: generatedValidation,
  };
}
