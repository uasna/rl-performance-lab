import fs from "node:fs/promises";

export type ShotCandidate = {
  path: string;
  count: number;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type TrainingJsonValidation = {
  ok: boolean;
  reason?: string;
  shots: number;
  shotPath?: string;
  candidates: ShotCandidate[];
};

export type TemFileValidation = {
  ok: boolean;
  reason?: string;
  sizeBytes?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keyLooksLikeShotContainer(key: string) {
  return /(^|[_\-.\s])(shots?|rounds?|sequences?|trainingsequence|trainingdata)([_\-.\s]|$)/i.test(key);
}

function keyLooksRelevantToTrainingShot(key: string) {
  return /(ball|car|player|location|position|rotation|velocity|time|boost|shot|spawn|goal|target)/i.test(key);
}

function objectLooksLikeShot(value: unknown) {
  if (!isObject(value)) return false;

  const keys = Object.keys(value);
  if (keys.length === 0) return false;

  const directRelevantKeys = keys.filter(keyLooksRelevantToTrainingShot).length;
  if (directRelevantKeys >= 2) return true;

  for (const child of Object.values(value)) {
    if (!isObject(child)) continue;
    const nestedRelevantKeys = Object.keys(child).filter(keyLooksRelevantToTrainingShot).length;
    if (nestedRelevantKeys >= 2) return true;
  }

  return false;
}

function collectShotCandidates(value: unknown, path = "$"): ShotCandidate[] {
  const candidates: ShotCandidate[] = [];

  if (Array.isArray(value)) {
    const lastKey = path.split(".").at(-1) ?? path;
    const objectItems = value.filter(isObject).length;
    const shotLikeItems = value.filter(objectLooksLikeShot).length;

    if (value.length > 0 && keyLooksLikeShotContainer(lastKey)) {
      candidates.push({
        path,
        count: value.length,
        confidence: shotLikeItems > 0 ? "high" : "medium",
        reason: `Array key looks like a shot container (${lastKey}).`,
      });
    } else if (value.length > 0 && objectItems > 0 && shotLikeItems / value.length >= 0.5) {
      candidates.push({
        path,
        count: value.length,
        confidence: "low",
        reason: "Array items look like training shot objects by heuristic.",
      });
    }

    for (let index = 0; index < value.length; index++) {
      candidates.push(...collectShotCandidates(value[index], `${path}[${index}]`));
    }

    return candidates;
  }

  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const safeKey = /^[a-zA-Z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
      candidates.push(...collectShotCandidates(child, `${path}${safeKey}`));
    }
  }

  return candidates;
}

function pickBestShotCandidate(candidates: ShotCandidate[]) {
  const score = (candidate: ShotCandidate) => {
    const confidenceScore = candidate.confidence === "high" ? 1000 : candidate.confidence === "medium" ? 500 : 100;
    const pathScore = /shots?/i.test(candidate.path) ? 100 : 0;
    return confidenceScore + pathScore + Math.min(candidate.count, 100);
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

export async function readJsonFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

export function validateTrainingJsonObject(
  parsed: unknown,
  expectedMinShots = 1
): TrainingJsonValidation {
  const candidates = collectShotCandidates(parsed);
  const best = pickBestShotCandidate(candidates);

  if (!best) {
    return {
      ok: false,
      reason: "No reliable shot container was found in the decoded JSON.",
      shots: 0,
      candidates,
    };
  }

  if (best.count <= 0) {
    return {
      ok: false,
      reason: "Shot container exists but has 0 shots.",
      shots: best.count,
      shotPath: best.path,
      candidates,
    };
  }

  if (best.count < expectedMinShots) {
    return {
      ok: false,
      reason: `Shot count is ${best.count}, expected at least ${expectedMinShots}.`,
      shots: best.count,
      shotPath: best.path,
      candidates,
    };
  }

  return {
    ok: true,
    shots: best.count,
    shotPath: best.path,
    candidates,
  };
}

export async function validateTrainingJsonFile(
  jsonFilePath: string,
  expectedMinShots = 1
): Promise<TrainingJsonValidation> {
  let parsed: unknown;

  try {
    parsed = await readJsonFile(jsonFilePath);
  } catch (error) {
    return {
      ok: false,
      reason: `Decoded JSON could not be read or parsed: ${(error as Error).message}`,
      shots: 0,
      candidates: [],
    };
  }

  return validateTrainingJsonObject(parsed, expectedMinShots);
}

export async function validateTemFile(
  temFilePath: string,
  minimumSizeBytes = 1024
): Promise<TemFileValidation> {
  try {
    const stat = await fs.stat(temFilePath);

    if (!stat.isFile()) {
      return { ok: false, reason: "Generated path is not a file." };
    }

    if (stat.size < minimumSizeBytes) {
      return {
        ok: false,
        reason: `Generated .Tem is suspiciously small (${stat.size} bytes).`,
        sizeBytes: stat.size,
      };
    }

    return { ok: true, sizeBytes: stat.size };
  } catch (error) {
    return {
      ok: false,
      reason: `Generated .Tem could not be read: ${(error as Error).message}`,
    };
  }
}
