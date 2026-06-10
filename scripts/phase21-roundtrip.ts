import path from "node:path";
import os from "node:os";
import { safeWriteTrainingPack } from "../src/backend/packs/safePackWriter";

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let index = 0; index < argv.length; index++) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index++;
  }

  return args;
}

function requireString(args: Args, key: string) {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function defaultStagingDir() {
  return path.join(os.homedir(), "AppData", "Local", "RocketLeagueAnalyser", "safe-pack-writer-staging");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const trainingCliPath = requireString(args, "rocketrp");
  const templateTemPath = requireString(args, "template");
  const installDir = requireString(args, "install-dir");
  const stagingRootDir = typeof args.staging === "string" ? args.staging : defaultStagingDir();
  const outputFileName = typeof args.output === "string" ? args.output : undefined;

  const result = await safeWriteTrainingPack({
    trainingCliPath,
    templateTemPath,
    stagingRootDir,
    installDir,
    outputFileName,
    expectedMinShots: 1,
    preserveShotCount: true,
    // Fase 21: roundtrip puro. No tocar campos hasta confirmar rutas JSON exactas.
    allowedPatchPathPrefixes: [],
  });

  console.log("SAFE PACK WRITER OK");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("SAFE PACK WRITER BLOCKED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
