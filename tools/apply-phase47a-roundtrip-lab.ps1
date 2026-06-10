param(
  [string]$Project = "C:\Projects\rl-performance-lab-electron-phase"
)

$ErrorActionPreference = "Stop"

function Read-Text($path) {
  if (-not (Test-Path $path)) { throw "No existe: $path" }
  return Get-Content $path -Raw -Encoding UTF8
}

function Write-Text($path, $text) {
  Set-Content -Path $path -Value $text -Encoding UTF8
}

function Backup-File($path) {
  if (-not (Test-Path $path)) { throw "No existe: $path" }
  $backup = "$path.bak47a"
  Copy-Item $path $backup -Force
  Write-Host "Backup: $backup" -ForegroundColor DarkGray
}

$mainPath = Join-Path $Project "electron\main.cjs"
$preloadPath = Join-Path $Project "electron\preload.cjs"
$bridgePath = Join-Path $Project "src\lib\electronBridge.ts"
$panelPath = Join-Path $Project "src\components\rocket-league\CustomPackFactoryPanel.tsx"

Write-Host "Phase 47A patch target:" -ForegroundColor Cyan
Write-Host $Project
Write-Host ""

foreach ($p in @($mainPath, $preloadPath, $bridgePath, $panelPath)) {
  if (-not (Test-Path $p)) { throw "Archivo requerido no encontrado: $p" }
}

Backup-File $mainPath
Backup-File $preloadPath
Backup-File $bridgePath
Backup-File $panelPath

$mainBlock = @'

// ─── PHASE 47A — ROUNDTRIP + BINARY WRITER LAB ───────────────────────────────
// Safety: this lab never installs .Tem files into MyTraining. It only writes
// debug files under Documents\My Games\RLA\training_packs\_phase47_lab.

function phase47ComputeFileHash(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return '';
  }
}

function phase47ListFilesByExtension(root, extension) {
  const results = [];
  const wanted = String(extension || '').toLowerCase();

  function visit(directory) {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === wanted) {
        results.push(fullPath);
      }
    }
  }

  if (root && fs.existsSync(root)) visit(root);
  return results;
}

function phase47ComputeByteDiff(bufA, bufB) {
  const maxLen = Math.max(bufA.length, bufB.length);
  const ranges = [];
  let diffCount = 0;
  let inRange = false;
  let rangeStart = 0;

  for (let index = 0; index < maxLen; index += 1) {
    const byteA = index < bufA.length ? bufA[index] : -1;
    const byteB = index < bufB.length ? bufB[index] : -1;
    const differs = byteA !== byteB;

    if (differs) {
      diffCount += 1;
      if (!inRange) {
        inRange = true;
        rangeStart = index;
      }
    } else if (inRange) {
      inRange = false;
      ranges.push({
        offset: rangeStart,
        length: index - rangeStart,
        sourceHex: bufA.subarray(rangeStart, Math.min(index, bufA.length)).toString('hex').slice(0, 96),
        roundtripHex: bufB.subarray(rangeStart, Math.min(index, bufB.length)).toString('hex').slice(0, 96),
      });
    }
  }

  if (inRange) {
    ranges.push({
      offset: rangeStart,
      length: maxLen - rangeStart,
      sourceHex: bufA.subarray(rangeStart).toString('hex').slice(0, 96),
      roundtripHex: bufB.subarray(rangeStart).toString('hex').slice(0, 96),
    });
  }

  return { count: diffCount, ranges };
}

function phase47ReadJsonFileOrNull(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function phase47ExtractRoundsFromTemJson(parsed) {
  try {
    const objects = parsed?.Objects;
    if (!Array.isArray(objects) || !objects.length) return [];
    const rounds = objects[0]?.Rounds;
    return Array.isArray(rounds) ? rounds : [];
  } catch {
    return [];
  }
}

function phase47ExtractFirstBallArchetype(rounds) {
  try {
    const archetypes = rounds?.[0]?.SerializedArchetypes;
    if (!Array.isArray(archetypes)) return '';
    return String(archetypes[0] ?? '');
  } catch {
    return '';
  }
}

function phase47DiffBallArchetypeFields(archetypeA, archetypeB) {
  const changes = [];
  let parsedA = null;
  let parsedB = null;

  try { parsedA = JSON.parse(archetypeA); } catch { return changes; }
  try { parsedB = JSON.parse(archetypeB); } catch { return changes; }
  if (!parsedA || !parsedB) return changes;

  const allKeys = new Set([...Object.keys(parsedA), ...Object.keys(parsedB)]);
  for (const key of allKeys) {
    if (parsedA[key] !== parsedB[key]) {
      changes.push({ field: key, a: parsedA[key] ?? null, b: parsedB[key] ?? null });
    }
  }
  return changes;
}

function phase47FindMyTrainingDirectories() {
  try {
    if (typeof findMyTrainingDirectories === 'function') return findMyTrainingDirectories();
  } catch { /* fallback below */ }

  const candidates = [
    path.join(os.homedir(), 'OneDrive', 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Training', '0000000000000000', 'MyTraining'),
    path.join(os.homedir(), 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Training', '0000000000000000', 'MyTraining'),
  ];

  return candidates.filter((candidate) => {
    try { return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(); } catch { return false; }
  });
}

function phase47FindTemFiles(directory) {
  try {
    if (typeof findTemFiles === 'function') return findTemFiles(directory);
  } catch { /* fallback below */ }
  return phase47ListFilesByExtension(directory, '.tem');
}

function phase47IsRlaGeneratedTem(filePath) {
  try {
    if (typeof getRlaGeneratedTemMarkers === 'function' && typeof isRlaGeneratedTem === 'function') {
      return isRlaGeneratedTem(filePath, getRlaGeneratedTemMarkers());
    }
  } catch { /* best effort */ }
  return /^313738|^42494e|rla/i.test(path.basename(String(filePath || '')));
}

function phase47MissingDependencyReport(labDir, missing) {
  const reportPath = path.join(labDir, 'phase47-roundtrip-binary-lab-report.json');
  const report = {
    mode: 'phase47-roundtrip-binary-lab-v1',
    createdAt: new Date().toISOString(),
    labDirectory: labDir,
    error: `Missing required runtime dependency: ${missing}`,
    inputFiles: [],
    roundtripResults: [],
    manualDiff: null,
    hypothesisVerdict: {
      roundtripClean: false,
      attemptedRoundtrips: 0,
      cleanRoundtrips: 0,
      sizeChangedRoundtrips: 0,
      corruptRoundtrips: 0,
      roundtripSizeChange: 0,
      conclusion: 'INSUFFICIENT_DATA',
      detail: `Phase 47A cannot run because ${missing} is not available in electron/main.cjs.`,
      recommendedPath: 'CHECK_PHASE_46_PATCH',
    },
    safeNextStep: 'Confirm Phase 46 is applied, then rerun Phase 47A Lab.',
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return { ok: false, reportPath, labDirectory: labDir, conclusion: 'INSUFFICIENT_DATA', message: report.error };
}

async function phase47RunRoundtrip(rocketRp, sourceTem, labDir, label) {
  const result = {
    label,
    sourcePath: sourceTem,
    sourceSize: 0,
    roundtripPath: '',
    roundtripSize: 0,
    sameSize: false,
    sourceHash: '',
    roundtripHash: '',
    sameHash: false,
    byteDiffCount: 0,
    changedRangeCount: 0,
    firstChangedRanges: [],
    sourceRoundsCount: 0,
    roundtripRoundsCount: 0,
    sourceFirstBallArchetype: '',
    roundtripFirstBallArchetype: '',
    archetypeSame: false,
    archetypeFieldChanges: [],
    verdict: 'ROUNDTRIP_FAILED',
    error: '',
  };

  if (!sourceTem || !fs.existsSync(sourceTem)) {
    result.error = 'Source .Tem not found';
    return result;
  }

  try {
    const sourceBuf = fs.readFileSync(sourceTem);
    result.sourceSize = sourceBuf.length;
    result.sourceHash = phase47ComputeFileHash(sourceTem);

    const decodeDir = path.join(labDir, `${label}-decode-${Date.now()}`);
    fs.mkdirSync(decodeDir, { recursive: true });
    const decoded = await decodeTemToJsonWithRocketRp(rocketRp, sourceTem, decodeDir, label);
    if (!decoded?.ok || !decoded.parsed) {
      result.verdict = 'DECODE_FAILED';
      result.error = decoded?.message || 'RocketRP decode failed';
      return result;
    }

    const sourceRounds = phase47ExtractRoundsFromTemJson(decoded.parsed);
    result.sourceRoundsCount = sourceRounds.length;
    result.sourceFirstBallArchetype = phase47ExtractFirstBallArchetype(sourceRounds);

    const decodedJsonPath = path.join(labDir, `${label}-source-decoded.json`);
    fs.writeFileSync(decodedJsonPath, JSON.stringify(decoded.parsed, null, 2), 'utf8');

    const encodeDir = path.join(labDir, `${label}-encode-${Date.now()}`);
    fs.mkdirSync(encodeDir, { recursive: true });
    const serialized = await serializeTrainingJsonWithRocketRp(rocketRp, decodedJsonPath, encodeDir);
    if (!serialized?.ok || !serialized.temFile || !fs.existsSync(serialized.temFile)) {
      result.verdict = 'ROUNDTRIP_FAILED';
      result.error = serialized?.message || 'RocketRP serialize failed';
      return result;
    }

    const roundtripTemPath = path.join(labDir, `${label}-roundtrip.Tem`);
    fs.copyFileSync(serialized.temFile, roundtripTemPath);
    result.roundtripPath = roundtripTemPath;

    const roundtripBuf = fs.readFileSync(roundtripTemPath);
    result.roundtripSize = roundtripBuf.length;
    result.roundtripHash = phase47ComputeFileHash(roundtripTemPath);
    result.sameSize = result.sourceSize === result.roundtripSize;
    result.sameHash = result.sourceHash === result.roundtripHash;

    const diff = phase47ComputeByteDiff(sourceBuf, roundtripBuf);
    result.byteDiffCount = diff.count;
    result.changedRangeCount = diff.ranges.length;
    result.firstChangedRanges = diff.ranges.slice(0, 8);

    const redecodeDir = path.join(labDir, `${label}-redecode-${Date.now()}`);
    fs.mkdirSync(redecodeDir, { recursive: true });
    const reDecoded = await decodeTemToJsonWithRocketRp(rocketRp, roundtripTemPath, redecodeDir, `${label}-roundtrip`);
    if (reDecoded?.ok && reDecoded.parsed) {
      const roundtripRounds = phase47ExtractRoundsFromTemJson(reDecoded.parsed);
      result.roundtripRoundsCount = roundtripRounds.length;
      result.roundtripFirstBallArchetype = phase47ExtractFirstBallArchetype(roundtripRounds);
      fs.writeFileSync(path.join(labDir, `${label}-roundtrip-decoded.json`), JSON.stringify(reDecoded.parsed, null, 2), 'utf8');
    } else {
      result.roundtripRoundsCount = -1;
    }

    result.archetypeSame = result.sourceFirstBallArchetype === result.roundtripFirstBallArchetype;
    result.archetypeFieldChanges = phase47DiffBallArchetypeFields(result.sourceFirstBallArchetype, result.roundtripFirstBallArchetype);

    if (result.sameHash) {
      result.verdict = 'IDENTICAL';
    } else if (result.roundtripRoundsCount === 0 || result.roundtripRoundsCount < result.sourceRoundsCount) {
      result.verdict = 'ROUNDS_LOST';
    } else if (!result.archetypeSame) {
      result.verdict = 'ARCHETYPE_CORRUPTED';
    } else {
      result.verdict = 'SIZE_CHANGED_ONLY';
    }
  } catch (err) {
    result.verdict = 'ROUNDTRIP_FAILED';
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

async function runPhase47Lab() {
  const labDir = path.join(resolveRlaTrainingPackLandingDirectory(), '_phase47_lab');
  fs.mkdirSync(labDir, { recursive: true });
  const reportPath = path.join(labDir, 'phase47-roundtrip-binary-lab-report.json');
  const createdAt = new Date().toISOString();

  if (typeof decodeTemToJsonWithRocketRp !== 'function') return phase47MissingDependencyReport(labDir, 'decodeTemToJsonWithRocketRp');
  if (typeof serializeTrainingJsonWithRocketRp !== 'function') return phase47MissingDependencyReport(labDir, 'serializeTrainingJsonWithRocketRp');
  if (typeof getRocketRpTrainingCliStatus !== 'function') return phase47MissingDependencyReport(labDir, 'getRocketRpTrainingCliStatus');

  const rocketRp = getRocketRpTrainingCliStatus();
  if (!rocketRp?.isAvailable) {
    const report = {
      mode: 'phase47-roundtrip-binary-lab-v1',
      createdAt,
      rocketRpPath: rocketRp?.executablePath || '',
      labDirectory: labDir,
      error: rocketRp?.message || 'RocketRP TrainingCLI not available',
      inputFiles: [],
      roundtripResults: [],
      manualDiff: null,
      hypothesisVerdict: {
        roundtripClean: false,
        attemptedRoundtrips: 0,
        cleanRoundtrips: 0,
        sizeChangedRoundtrips: 0,
        corruptRoundtrips: 0,
        roundtripSizeChange: 0,
        conclusion: 'INSUFFICIENT_DATA',
        detail: 'RocketRP TrainingCLI not available. Cannot run Phase 47A Lab.',
        recommendedPath: 'INSTALL_ROCKETRP_FIRST',
      },
      safeNextStep: 'Configure RocketRP TrainingCLI path in the app settings.',
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    return { ok: false, reportPath, labDirectory: labDir, conclusion: 'INSUFFICIENT_DATA', message: report.error };
  }

  const myTrainingDirs = phase47FindMyTrainingDirectories();
  const allTemFiles = myTrainingDirs.flatMap((dir) => phase47FindTemFiles(dir));
  const knownLabels = [
    { label: 'DIFF_A', guid: '6243EDA2419D2EF4AA6AF1BF150A95F4' },
    { label: 'DIFF_B', guid: '53B9552948E33E53B3F5A1855A15D4D3' },
    { label: 'TEMPLATE_15', guid: '5F843FEC4549543650E550B85AB97547' },
    { label: 'RLA_TEMPLATE_15_CLONE', guid: '42494E5445535420260610154103' },
    { label: 'SPEEDFLIP_REFERENCE', guid: '8FD6CA4E483C682925698AA34D1EE8A4' },
  ];

  const inputFiles = knownLabels.map((entry) => {
    const match = allTemFiles.find((file) => path.basename(file).toUpperCase().startsWith(entry.guid.toUpperCase()));
    return {
      label: entry.label,
      guid: entry.guid,
      path: match || '',
      exists: Boolean(match && fs.existsSync(match)),
      rlaGenerated: match ? phase47IsRlaGeneratedTem(match) : false,
    };
  });

  const rlaLatest = allTemFiles
    .filter((file) => phase47IsRlaGeneratedTem(file))
    .sort((a, b) => {
      try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
    })[0];

  if (rlaLatest && !inputFiles.some((entry) => entry.path === rlaLatest)) {
    inputFiles.push({ label: 'RLA_GENERATED_LATEST', guid: '', path: rlaLatest, exists: true, rlaGenerated: true });
  }

  const roundtripResults = [];
  for (const entry of inputFiles) {
    if (!entry.exists || !entry.path) {
      roundtripResults.push({
        label: entry.label,
        sourcePath: entry.path,
        sourceSize: 0,
        roundtripPath: '',
        roundtripSize: 0,
        sameSize: false,
        sourceHash: '',
        roundtripHash: '',
        sameHash: false,
        byteDiffCount: 0,
        changedRangeCount: 0,
        firstChangedRanges: [],
        sourceRoundsCount: 0,
        roundtripRoundsCount: 0,
        sourceFirstBallArchetype: '',
        roundtripFirstBallArchetype: '',
        archetypeSame: false,
        archetypeFieldChanges: [],
        verdict: 'ROUNDTRIP_FAILED',
        error: 'File not found on disk',
      });
      continue;
    }
    roundtripResults.push(await phase47RunRoundtrip(rocketRp, entry.path, labDir, entry.label));
  }

  let manualDiff = null;
  const entryA = inputFiles.find((entry) => entry.label === 'DIFF_A');
  const entryB = inputFiles.find((entry) => entry.label === 'DIFF_B');
  if (entryA?.exists && entryB?.exists) {
    try {
      const bufA = fs.readFileSync(entryA.path);
      const bufB = fs.readFileSync(entryB.path);
      const binDiff = phase47ComputeByteDiff(bufA, bufB);
      const parsedA = phase47ReadJsonFileOrNull(path.join(labDir, 'DIFF_A-source-decoded.json'));
      const parsedB = phase47ReadJsonFileOrNull(path.join(labDir, 'DIFF_B-source-decoded.json'));
      let fieldChanges = [];
      if (parsedA && parsedB) {
        const archA = phase47ExtractFirstBallArchetype(phase47ExtractRoundsFromTemJson(parsedA));
        const archB = phase47ExtractFirstBallArchetype(phase47ExtractRoundsFromTemJson(parsedB));
        fieldChanges = phase47DiffBallArchetypeFields(archA, archB);
      }
      manualDiff = {
        labelA: 'DIFF_A',
        labelB: 'DIFF_B',
        sizeA: bufA.length,
        sizeB: bufB.length,
        sizeDelta: bufB.length - bufA.length,
        binaryByteDiffCount: binDiff.count,
        changedRangeCount: binDiff.ranges.length,
        firstChangedRanges: binDiff.ranges.slice(0, 12),
        jsonDiff: { ballArchetypeFieldChanges: fieldChanges },
      };
    } catch (err) {
      manualDiff = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const attemptedRoundtrips = roundtripResults.filter((result) => result.verdict !== 'ROUNDTRIP_FAILED' && result.verdict !== 'DECODE_FAILED').length;
  const cleanRoundtrips = roundtripResults.filter((result) => result.verdict === 'IDENTICAL').length;
  const corruptRoundtrips = roundtripResults.filter((result) => result.verdict === 'ROUNDS_LOST' || result.verdict === 'ARCHETYPE_CORRUPTED').length;
  const sizeChangedRoundtrips = roundtripResults.filter((result) => result.verdict === 'SIZE_CHANGED_ONLY').length;
  const firstSizeChangeResult = roundtripResults.find((result) => !result.sameSize && result.sourceSize > 0 && result.roundtripSize > 0);

  let conclusion = 'INSUFFICIENT_DATA';
  let detail = 'No successful roundtrips were attempted.';
  let recommendedPath = 'CHECK_MYTRAINING_PATH_AND_ROCKETRP';

  if (attemptedRoundtrips > 0 && cleanRoundtrips === attemptedRoundtrips) {
    conclusion = 'ROUNDTRIP_CLEAN';
    detail = 'RocketRP serialize produced byte-for-byte identical .Tem files. The 0/0 issue is likely caused by JSON mutation strategy.';
    recommendedPath = 'PATCH_JSON_FIELDS_SAFELY';
  } else if (corruptRoundtrips > 0) {
    conclusion = 'ROCKETRP_SERIALIZE_CORRUPTS_TEM';
    detail = `RocketRP serialize lost rounds or changed first ball archetype in ${corruptRoundtrips} file(s).`;
    recommendedPath = 'BINARY_WRITER_NEEDED';
  } else if (sizeChangedRoundtrips > 0) {
    conclusion = 'PARTIAL_CORRUPTION';
    detail = 'RocketRP serialize changed binary size/hash while preserving decoded archetype text. Rocket League may still reject due to binary/header/CRC differences.';
    recommendedPath = 'BINARY_WRITER_NEEDED_OR_HEADER_PATCH';
  }

  const safeNextStepMap = {
    PATCH_JSON_FIELDS_SAFELY: 'Run one controlled JSON field patch only in preview mode; do not install until Rocket League validation is manual.',
    BINARY_WRITER_NEEDED: 'Use Template Bank for installable packs; keep binary writer experimental only.',
    BINARY_WRITER_NEEDED_OR_HEADER_PATCH: 'Investigate first changed ranges and consider header/CRC patch lab; use Template Bank as stable fallback.',
    CHECK_MYTRAINING_PATH_AND_ROCKETRP: 'Verify MyTraining path and RocketRP TrainingCLI configuration.',
  };

  const report = {
    mode: 'phase47-roundtrip-binary-lab-v1',
    createdAt,
    rocketRpPath: rocketRp.executablePath,
    labDirectory: labDir,
    inputFiles,
    roundtripResults,
    manualDiff,
    hypothesisVerdict: {
      roundtripClean: cleanRoundtrips === attemptedRoundtrips && attemptedRoundtrips > 0,
      attemptedRoundtrips,
      cleanRoundtrips,
      sizeChangedRoundtrips,
      corruptRoundtrips,
      roundtripSizeChange: firstSizeChangeResult ? firstSizeChangeResult.roundtripSize - firstSizeChangeResult.sourceSize : 0,
      conclusion,
      detail,
      recommendedPath,
    },
    safeNextStep: safeNextStepMap[recommendedPath] || detail,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  return {
    ok: true,
    reportPath,
    labDirectory: labDir,
    conclusion,
    message: `Phase 47A lab complete. Conclusion: ${conclusion}. Report: ${reportPath}`,
  };
}

// ─── END PHASE 47A ────────────────────────────────────────────────────────────
'@

# 1) electron/main.cjs
$main = Read-Text $mainPath
if ($main -notmatch "PHASE 47A.*ROUNDTRIP") {
  if ($main -notmatch "app\.whenReady\(\)") { throw "No encontré app.whenReady() en electron/main.cjs" }
  $main = $main -replace "(?m)^app\.whenReady\(\)", ($mainBlock + "`r`napp.whenReady()")
  Write-Host "main.cjs: bloque Phase 47A insertado" -ForegroundColor Green
} else {
  Write-Host "main.cjs: bloque Phase 47A ya existe, se omite" -ForegroundColor Yellow
}

if ($main -notmatch "desktop:run-phase47-lab") {
  $needle = "ipcMain.handle('desktop:get-training-pack-status', async () => getTrainingPackStatus());"
  if ($main.Contains($needle)) {
    $main = $main.Replace($needle, "$needle`r`nipcMain.handle('desktop:run-phase47-lab', async () => runPhase47Lab());")
    Write-Host "main.cjs: handler IPC agregado" -ForegroundColor Green
  } else {
    throw "No encontré handler desktop:get-training-pack-status en main.cjs"
  }
} else {
  Write-Host "main.cjs: handler Phase 47A ya existe, se omite" -ForegroundColor Yellow
}
Write-Text $mainPath $main

# 2) electron/preload.cjs
$preload = Read-Text $preloadPath
if ($preload -notmatch "runPhase47Lab") {
  $needle = "  openTrainingPackLanding: () => ipcRenderer.invoke('desktop:open-training-pack-landing'),"
  if ($preload.Contains($needle)) {
    $preload = $preload.Replace($needle, "$needle`r`n  runPhase47Lab: () => ipcRenderer.invoke('desktop:run-phase47-lab'),")
    Write-Host "preload.cjs: método runPhase47Lab agregado" -ForegroundColor Green
  } else {
    throw "No encontré openTrainingPackLanding en preload.cjs"
  }
} else {
  Write-Host "preload.cjs: runPhase47Lab ya existe, se omite" -ForegroundColor Yellow
}
Write-Text $preloadPath $preload

# 3) src/lib/electronBridge.ts
$bridge = Read-Text $bridgePath
if ($bridge -notmatch "Phase47LabResult") {
  $typeBlock = @'

export type Phase47LabResult = {
  ok: boolean;
  reportPath: string;
  labDirectory?: string;
  conclusion?: string;
  message: string;
};
'@
  $needle = "export type DesktopTrainingPackDraft = {"
  if ($bridge.Contains($needle)) {
    $bridge = $bridge.Replace($needle, "$typeBlock`r`n$needle")
    Write-Host "electronBridge.ts: tipo Phase47LabResult agregado" -ForegroundColor Green
  } else {
    throw "No encontré DesktopTrainingPackDraft para insertar el tipo Phase47LabResult"
  }
} else {
  Write-Host "electronBridge.ts: Phase47LabResult ya existe, se omite" -ForegroundColor Yellow
}

if ($bridge -notmatch "runPhase47Lab: \(\) => Promise<Phase47LabResult>") {
  $needle = "  openTrainingPackLanding: () => Promise<string>;"
  if ($bridge.Contains($needle)) {
    $bridge = $bridge.Replace($needle, "$needle`r`n  runPhase47Lab: () => Promise<Phase47LabResult>;")
    Write-Host "electronBridge.ts: método en interfaz agregado" -ForegroundColor Green
  } else {
    throw "No encontré openTrainingPackLanding en interfaz ElectronBridge"
  }
} else {
  Write-Host "electronBridge.ts: método en interfaz ya existe, se omite" -ForegroundColor Yellow
}

if ($bridge -notmatch "export async function runPhase47Lab\(") {
  $needle = @'
export async function openTrainingPackLanding() {
  return requireDesktopBridge().openTrainingPackLanding();
}
'@
  $insert = @'
export async function openTrainingPackLanding() {
  return requireDesktopBridge().openTrainingPackLanding();
}

export async function runPhase47Lab() {
  return requireDesktopBridge().runPhase47Lab();
}
'@
  if ($bridge.Contains($needle)) {
    $bridge = $bridge.Replace($needle, $insert)
    Write-Host "electronBridge.ts: función exportada runPhase47Lab agregada" -ForegroundColor Green
  } else {
    throw "No encontré función openTrainingPackLanding exportada en electronBridge.ts"
  }
} else {
  Write-Host "electronBridge.ts: función exportada ya existe, se omite" -ForegroundColor Yellow
}
Write-Text $bridgePath $bridge

# 4) CustomPackFactoryPanel.tsx
$panel = Read-Text $panelPath
if ($panel -notmatch "runPhase47Lab") {
  $needle = "  openTrainingPackLanding,"
  if ($panel.Contains($needle)) {
    $panel = $panel.Replace($needle, "$needle`r`n  runPhase47Lab,")
    Write-Host "CustomPackFactoryPanel: import runPhase47Lab agregado" -ForegroundColor Green
  } else {
    throw "No encontré openTrainingPackLanding en imports del panel"
  }
} else {
  Write-Host "CustomPackFactoryPanel: import runPhase47Lab ya existe, se omite" -ForegroundColor Yellow
}

if ($panel -notmatch "async function runLab47\(") {
  $pattern = "(?s)  async function openLanding\(\) \{.*?\r?\n  \}\r?\n"
  $match = [regex]::Match($panel, $pattern)
  if ($match.Success) {
    $functionBlock = @'

  async function runLab47() {
    if (!isElectronRuntime()) return;
    setWorking(true);
    try {
      const result = await runPhase47Lab();
      setDesktopStatus((current) => current
        ? { ...current, ok: result.ok, message: result.message }
        : {
          ok: result.ok,
          message: result.message,
          rlaLandingDirectory: result.labDirectory ?? '',
          rocketTrainingRoot: '',
          myTrainingDirectories: [],
        }
      );
    } finally {
      setWorking(false);
    }
  }
'@
    $panel = $panel.Remove($match.Index, $match.Length).Insert($match.Index, $match.Value + $functionBlock)
    Write-Host "CustomPackFactoryPanel: función runLab47 agregada" -ForegroundColor Green
  } else {
    throw "No encontré función openLanding para insertar runLab47"
  }
} else {
  Write-Host "CustomPackFactoryPanel: runLab47 ya existe, se omite" -ForegroundColor Yellow
}

if ($panel -notmatch "Phase 47A Lab") {
  $needle = '<button type="button" onClick={refreshBridge} disabled={!isElectronRuntime() || working}>Re-escanear carpetas</button>'
  if ($panel.Contains($needle)) {
    $insert = '<button type="button" onClick={runLab47} disabled={!isElectronRuntime() || working}>Phase 47A Lab</button>'
    $panel = $panel.Replace($needle, "$insert`r`n        $needle")
    Write-Host "CustomPackFactoryPanel: botón Phase 47A Lab agregado" -ForegroundColor Green
  } else {
    throw "No encontré botón Re-escanear carpetas para insertar Phase 47A Lab"
  }
} else {
  Write-Host "CustomPackFactoryPanel: botón Phase 47A Lab ya existe, se omite" -ForegroundColor Yellow
}
Write-Text $panelPath $panel

Write-Host ""
Write-Host "Phase 47A aplicado. Ahora corré:" -ForegroundColor Cyan
Write-Host "cd $Project"
Write-Host "npx tsc --noEmit"
Write-Host ".\BUILD-INSTALLER.bat"
