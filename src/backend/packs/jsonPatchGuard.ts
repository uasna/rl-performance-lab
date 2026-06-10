export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type DiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function encodePointerPart(part: string) {
  return part.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function collectJsonDiffs(before: unknown, after: unknown, basePath = ""): DiffEntry[] {
  if (Object.is(before, after)) return [];

  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      return [{ path: basePath || "/", before, after }];
    }

    const max = Math.max(before.length, after.length);
    const diffs: DiffEntry[] = [];

    for (let index = 0; index < max; index++) {
      diffs.push(...collectJsonDiffs(before[index], after[index], `${basePath}/${index}`));
    }

    return diffs;
  }

  if (isObject(before) || isObject(after)) {
    if (!isObject(before) || !isObject(after)) {
      return [{ path: basePath || "/", before, after }];
    }

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs: DiffEntry[] = [];

    for (const key of keys) {
      diffs.push(
        ...collectJsonDiffs(
          before[key],
          after[key],
          `${basePath}/${encodePointerPart(key)}`
        )
      );
    }

    return diffs;
  }

  return [{ path: basePath || "/", before, after }];
}

function isPathAllowed(path: string, allowedPathPrefixes: string[]) {
  return allowedPathPrefixes.some((allowed) => {
    const normalized = allowed.endsWith("/") ? allowed.slice(0, -1) : allowed;
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

export function assertOnlyAllowedJsonPathsChanged(params: {
  before: unknown;
  after: unknown;
  allowedPathPrefixes: string[];
}) {
  const diffs = collectJsonDiffs(params.before, params.after);
  const blocked = diffs.filter((diff) => !isPathAllowed(diff.path, params.allowedPathPrefixes));

  if (blocked.length > 0) {
    const preview = blocked
      .slice(0, 12)
      .map((diff) => `- ${diff.path}`)
      .join("\n");

    throw new Error(
      `Unsafe patch blocked. Changed JSON paths are not in the allowed list:\n${preview}${
        blocked.length > 12 ? `\n...and ${blocked.length - 12} more` : ""
      }`
    );
  }

  return diffs;
}
