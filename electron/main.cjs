const { app, BrowserWindow, ipcMain, shell, dialog, desktopCapturer } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const crypto = require('node:crypto');

let mainWindow = null;
let replayWatcher = null;
let replayDirectory = resolveDefaultReplayDirectory();
let detectedReplayPaths = new Set();
let configuredRattletrapPath = '';
let configuredRrrocketPath = '';
let configuredRocketRpTrainingCliPath = '';

let statsApiLiveSocket = null;
let statsApiLiveBuffer = '';
let statsApiLiveManualStop = true;
let statsApiLiveReconnectTimer = null;
let statsApiLivePort = 49123;
let statsApiLiveHost = '127.0.0.1';
let statsApiLiveMessageCount = 0;

const isDev = process.argv.includes('--dev') || Boolean(process.env.VITE_DEV_SERVER_URL);
const MAX_JSON_PARSE_BYTES = 220 * 1024 * 1024;

function resolveDefaultReplayDirectory() {
  const standardPath = path.join(os.homedir(), 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Demos');
  const oneDriveEpicPath = path.join(os.homedir(), 'OneDrive', 'Documents', 'My Games', 'Rocket League', 'TAGame', 'DemosEpic');
  const oneDriveStandardPath = path.join(os.homedir(), 'OneDrive', 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Demos');
  const epicPath = path.join(os.homedir(), 'Documents', 'My Games', 'Rocket League', 'TAGame', 'DemosEpic');

  for (const candidate of [oneDriveEpicPath, epicPath, oneDriveStandardPath, standardPath]) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Si una ruta no responde, se prueba la siguiente.
    }
  }

  return oneDriveEpicPath;
}

function getDesktopConfigPath() {
  return path.join(app.getPath('userData'), 'desktop-config.json');
}

function readDesktopConfig() {
  try {
    const configPath = getDesktopConfigPath();
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function writeDesktopConfig(nextConfig) {
  const current = readDesktopConfig();
  const merged = { ...current, ...nextConfig, updatedAt: new Date().toISOString() };
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getDesktopConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function hydrateDesktopConfig() {
  const config = readDesktopConfig();
  if (typeof config.replayDirectory === 'string' && config.replayDirectory.trim()) {
    replayDirectory = config.replayDirectory;
  }
  if (typeof config.rattletrapPath === 'string' && config.rattletrapPath.trim()) {
    configuredRattletrapPath = config.rattletrapPath;
  }
  if (typeof config.rrrocketPath === 'string' && config.rrrocketPath.trim()) {
    configuredRrrocketPath = config.rrrocketPath;
  }
  if (typeof config.rocketRpTrainingCliPath === 'string' && config.rocketRpTrainingCliPath.trim()) {
    configuredRocketRpTrainingCliPath = config.rocketRpTrainingCliPath;
  }
}

function pathExists(candidate) {
  try {
    return Boolean(candidate && fs.existsSync(candidate));
  } catch {
    return false;
  }
}

function directoryExists(candidate) {
  try {
    return Boolean(candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory());
  } catch {
    return false;
  }
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths.filter(Boolean)) {
    const normalized = String(item).toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item);
  }
  return result;
}

function getPreferredDocumentsCandidates() {
  const home = os.homedir();
  return uniquePaths([
    process.env.OneDrive ? path.join(process.env.OneDrive, 'Documents') : '',
    process.env.OneDriveConsumer ? path.join(process.env.OneDriveConsumer, 'Documents') : '',
    process.env.OneDriveCommercial ? path.join(process.env.OneDriveCommercial, 'Documents') : '',
    path.join(home, 'OneDrive', 'Documents'),
    path.join(home, 'Documents'),
    app.isReady() ? app.getPath('documents') : '',
  ]);
}

function resolveDefaultTrainingDirectory() {
  const candidates = getPreferredDocumentsCandidates().map((documentsPath) => path.join(documentsPath, 'My Games', 'Rocket League', 'TAGame', 'Training'));
  return candidates.find(directoryExists) || candidates[0];
}

function resolveDefaultMyTrainingDirectory() {
  const candidates = getPreferredDocumentsCandidates().flatMap((documentsPath) => {
    const trainingRoot = path.join(documentsPath, 'My Games', 'Rocket League', 'TAGame', 'Training');
    return [
      path.join(trainingRoot, '0000000000000000', 'MyTraining'),
      trainingRoot,
    ];
  });
  const direct = candidates.find((candidate) => path.basename(candidate).toLowerCase() === 'mytraining' && directoryExists(candidate));
  if (direct) return direct;

  for (const trainingRoot of candidates.filter((candidate) => path.basename(candidate).toLowerCase() !== 'mytraining' && directoryExists(candidate))) {
    try {
      const entries = fs.readdirSync(trainingRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const nested = path.join(trainingRoot, entry.name, 'MyTraining');
        if (directoryExists(nested)) return nested;
      }
    } catch {
      // probar siguiente ruta
    }
  }

  return path.join(resolveDefaultTrainingDirectory(), '0000000000000000', 'MyTraining');
}

function myTrainingHasTemFiles(directory) {
  try {
    return directoryExists(directory) && fs.readdirSync(directory).some((file) => file.toLowerCase().endsWith('.tem'));
  } catch {
    return false;
  }
}

function ensureDefaultDesktopPaths() {
  const config = readDesktopConfig();
  const patch = {};

  if (!config.statsApiConfigPath) {
    const statsPath = getRocketLeagueInstallConfigCandidates().find(pathExists);
    if (statsPath) patch.statsApiConfigPath = statsPath;
  }

  if (!config.selectedMyTrainingDirectory) {
    const myTraining = resolveDefaultMyTrainingDirectory();
    if (directoryExists(myTraining)) patch.selectedMyTrainingDirectory = myTraining;
  }

  if (!config.selectedTrainingTemplateDirectory) {
    const myTraining = resolveDefaultMyTrainingDirectory();
    if (myTrainingHasTemFiles(myTraining)) patch.selectedTrainingTemplateDirectory = myTraining;
  }

  if (!config.rocketRpTrainingCliPath) {
    const bundledRocketRp = getBundledRocketRpTrainingCliPath();
    if (pathExists(bundledRocketRp)) patch.rocketRpTrainingCliPath = bundledRocketRp;
  }

  if (!config.replayDirectory && directoryExists(resolveDefaultReplayDirectory())) {
    patch.replayDirectory = resolveDefaultReplayDirectory();
  }

  if (Object.keys(patch).length) {
    writeDesktopConfig(patch);
    hydrateDesktopConfig();
  }

  return { ...readDesktopConfig(), defaultMyTrainingDirectory: resolveDefaultMyTrainingDirectory(), defaultTrainingDirectory: resolveDefaultTrainingDirectory() };
}

function getBundledRattletrapPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vendor', 'rattletrap', 'rattletrap.exe');
  }

  return path.join(__dirname, '..', 'vendor', 'rattletrap', 'rattletrap.exe');
}

function getBundledRrrocketPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vendor', 'rrrocket', 'rrrocket.exe');
  }

  return path.join(__dirname, '..', 'vendor', 'rrrocket', 'rrrocket.exe');
}

function getBundledRocketRpTrainingCliPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'vendor', 'rocketrp', 'RocketRP.TrainingCLI.exe');
  }

  return path.join(__dirname, '..', 'vendor', 'rocketrp', 'RocketRP.TrainingCLI.exe');
}

function getRocketRpTrainingCliPath() {
  if (configuredRocketRpTrainingCliPath && fs.existsSync(configuredRocketRpTrainingCliPath)) return configuredRocketRpTrainingCliPath;
  return getBundledRocketRpTrainingCliPath();
}

function getRocketRpTrainingCliStatus() {
  const executablePath = getRocketRpTrainingCliPath();
  const bundledPath = getBundledRocketRpTrainingCliPath();
  const exeExists = fs.existsSync(executablePath);
  const dllPath = executablePath.replace(/\.exe$/i, '.dll');
  const runtimeConfigPath = executablePath.replace(/\.exe$/i, '.runtimeconfig.json');
  const depsPath = executablePath.replace(/\.exe$/i, '.deps.json');
  const hasDll = fs.existsSync(dllPath);
  const hasRuntime = fs.existsSync(runtimeConfigPath);
  const hasDeps = fs.existsSync(depsPath);
  const isComplete = exeExists && hasDll && hasRuntime;
  const source = configuredRocketRpTrainingCliPath && executablePath === configuredRocketRpTrainingCliPath ? 'manual' : 'vendor';
  return {
    isAvailable: isComplete,
    executablePath,
    bundledPath,
    source,
    message: isComplete
      ? `RocketRP TrainingCLI completo (${source === 'manual' ? 'ruta manual' : 'vendor local'}).`
      : exeExists
        ? `RocketRP incompleto: existe el .exe, pero falta ${!hasDll ? 'RocketRP.TrainingCLI.dll' : !hasRuntime ? 'RocketRP.TrainingCLI.runtimeconfig.json' : 'algún archivo de publicación'}. Copiá toda la carpeta publish/release, no solo el .exe.`
        : 'RocketRP.TrainingCLI.exe no está configurado. Es necesario para serializar .Tem reales sin clonar packs existentes.',
    diagnostics: { exeExists, dllPath, hasDll, runtimeConfigPath, hasRuntime, depsPath, hasDeps },
  };
}

function getRattletrapPath() {
  if (configuredRattletrapPath && fs.existsSync(configuredRattletrapPath)) return configuredRattletrapPath;
  return getBundledRattletrapPath();
}

function getRrrocketPath() {
  if (configuredRrrocketPath && fs.existsSync(configuredRrrocketPath)) return configuredRrrocketPath;
  return getBundledRrrocketPath();
}

function getRattletrapStatus() {
  const executablePath = getRattletrapPath();
  const bundledPath = getBundledRattletrapPath();
  const exists = fs.existsSync(executablePath);
  const source = configuredRattletrapPath && executablePath === configuredRattletrapPath ? 'manual' : 'vendor';

  const rrrocketPath = getRrrocketPath();
  const rrrocketBundledPath = getBundledRrrocketPath();
  const rrrocketExists = fs.existsSync(rrrocketPath);
  const rrrocketSource = configuredRrrocketPath && rrrocketPath === configuredRrrocketPath ? 'manual' : 'vendor';
  const activeParser = exists ? 'rattletrap' : rrrocketExists ? 'rrrocket' : 'none';

  return {
    isAvailable: exists || rrrocketExists,
    executablePath,
    bundledPath,
    source,
    message: exists
      ? `Rattletrap listo (${source === 'manual' ? 'ruta manual' : 'vendor local'}).`
      : rrrocketExists
        ? `Rattletrap no disponible, pero rrrocket está listo (${rrrocketSource === 'manual' ? 'ruta manual' : 'vendor local'}).`
        : 'No se encontró parser local. Colocá rattletrap.exe o rrrocket.exe en vendor, o seleccionalo manualmente.',
    rattletrapAvailable: exists,
    rattletrapPath: executablePath,
    rattletrapSource: source,
    rrrocketAvailable: rrrocketExists,
    rrrocketPath,
    rrrocketBundledPath,
    rrrocketSource,
    activeParser,
  };
}

function ensureReplayDirectory() {
  try {
    if (!fs.existsSync(replayDirectory)) return false;
    return fs.statSync(replayDirectory).isDirectory();
  } catch {
    return false;
  }
}

function toReplayFile(filePath) {
  const stat = fs.statSync(filePath);
  return {
    id: Buffer.from(filePath).toString('base64url'),
    fileName: path.basename(filePath),
    path: filePath,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    status: 'detectado',
  };
}

function scanReplayFiles() {
  if (!ensureReplayDirectory()) return [];

  return fs
    .readdirSync(replayDirectory)
    .filter((fileName) => fileName.toLowerCase().endsWith('.replay'))
    .map((fileName) => path.join(replayDirectory, fileName))
    .filter((filePath) => {
      try {
        return fs.statSync(filePath).isFile();
      } catch {
        return false;
      }
    })
    .map(toReplayFile)
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
}

function getWatcherStatus(message = 'Awaiting replay') {
  return {
    isDesktop: true,
    isWatching: Boolean(replayWatcher),
    replayDirectory,
    lastMessage: message,
    detectedFiles: detectedReplayPaths.size,
  };
}

function emitReplayDetected(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    const replayFile = toReplayFile(filePath);
    detectedReplayPaths.add(filePath);
    mainWindow.webContents.send('replay:file-detected', replayFile);
  } catch {
    // El archivo puede estar escribiéndose todavía; se ignora hasta el siguiente escaneo.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#020617',
    title: 'RL Performance Lab',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function ensureParsedReplayDirectory() {
  const parsedDirectory = path.join(app.getPath('userData'), 'parsed-replays');
  fs.mkdirSync(parsedDirectory, { recursive: true });
  return parsedDirectory;
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-z0-9_.-]/gi, '_');
}

function getParsedReplayOutputPath(replayPath) {
  const baseName = sanitizeFileName(path.basename(replayPath, path.extname(replayPath)));
  return path.join(ensureParsedReplayDirectory(), `${baseName}.json`);
}

function createEmptyMetrics(extra = {}) {
  return {
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    demos: 0,
    boostWasted: 0,
    avgSpeed: 0,
    supersonicPercent: 0,
    coastingPercent: 0,
    playerCount: 0,
    detectedPlayers: [],
    topLevelKeys: [],
    jsonSizeBytes: 0,
    ...extra,
  };
}

function safeString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isInternalReplayToken(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return /(^|[._])(?:car|ball|goalvolume|team|vehiclepickup|pickup|gameevent|pri|engine|tagame|default__)_/i.test(text) ||
    /(?:^|[._])(?:Car_TA|Ball_TA|GoalVolume_TA|Team_TA|PRI_TA|GameEvent_TA|VehiclePickup_TA)(?:_|$)/i.test(text) ||
    /default__|tagame\.|engine\.|class\s|object\s|archetypes|spawned|replication/i.test(text);
}

function isPlausiblePlayerName(value) {
  const text = String(value || '').trim();
  if (!text || text.length < 2 || text.length > 32) return false;
  if (/^\d+$/.test(text)) return false;
  if (/^[a-f0-9]{18,}$/i.test(text)) return false;
  if (isInternalReplayToken(text)) return false;
  if (/^[A-Za-z]+_TA_?\d*$/i.test(text)) return false;
  return true;
}

function extractValueText(value) {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(extractValueText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const record = value;
    for (const key of ['string', 'name', 'value', 'text', 'player_name', 'PlayerName']) {
      if (key in record) {
        const nested = extractValueText(record[key]);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function extractPotentialPlayersFromJson(json) {
  const names = new Set();
  const maxHits = 16;

  walkJson(json, (node, pathSegments) => {
    if (names.size >= maxHits || Array.isArray(node) || !node || typeof node !== 'object') return names.size < maxHits;
    const pathText = pathSegments.join(' ').toLowerCase();
    const looksPlayerScoped = /player|pri|reservation|online|user/.test(pathText);
    if (!looksPlayerScoped) return true;

    for (const [key, value] of Object.entries(node)) {
      const normalizedKey = normalizeSearchKey(key);
      const isNameKey = ['playername', 'player_name', 'displayname', 'username', 'onlineid', 'name'].includes(normalizedKey);
      if (!isNameKey) continue;
      const text = extractValueText(value).trim();
      if (isPlausiblePlayerName(text)) names.add(text.replace(/\s+/g, ' '));
      if (names.size >= maxHits) return false;
    }
    return true;
  }, { maxNodes: 90000, maxArrayItems: 9000 });

  return Array.from(names).slice(0, 12);
}

function extractNumberNearKey(json, wantedKeys) {
  const seen = new WeakSet();
  let result = 0;

  function visit(node) {
    if (!node || result !== 0) return;
    if (typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20000)) visit(item);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      const normalized = key.toLowerCase();
      if (wantedKeys.some((wanted) => normalized.includes(wanted))) {
        const numericValue = Number(extractValueText(value));
        if (Number.isFinite(numericValue) && numericValue > 0) {
          result = numericValue;
          return;
        }
      }
      if (typeof value === 'object') visit(value);
      if (result !== 0) return;
    }
  }

  visit(json);
  return result;
}

function extractBasicReplayMetrics(json, jsonSizeBytes) {
  const detectedPlayers = extractPotentialPlayersFromJson(json);
  const topLevelKeys = json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json).slice(0, 16) : [];

  return createEmptyMetrics({
    goals: extractNumberNearKey(json, ['goals', 'goalcount']),
    assists: extractNumberNearKey(json, ['assists']),
    saves: extractNumberNearKey(json, ['saves']),
    shots: extractNumberNearKey(json, ['shots']),
    demos: extractNumberNearKey(json, ['demos', 'demolitions']),
    playerCount: detectedPlayers.length,
    detectedPlayers,
    topLevelKeys,
    jsonSizeBytes,
  });
}

function normalizeSearchKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const text = extractValueText(value);
  if (!text) return null;
  const parsed = Number(text.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanPlayerName(value) {
  const text = extractValueText(value).trim();
  if (!isPlausiblePlayerName(text)) return '';
  if (/none|null|true|false/i.test(text)) return '';
  return text.replace(/\s+/g, ' ');
}

function walkJson(root, visitor, options = {}) {
  const maxNodes = options.maxNodes ?? 80000;
  const maxArrayItems = options.maxArrayItems ?? 7000;
  const seen = new WeakSet();
  let visited = 0;
  let stopped = false;

  function visit(node, pathSegments = []) {
    if (stopped || visited >= maxNodes) return;
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    visited += 1;

    const shouldStop = visitor(node, pathSegments, visited);
    if (shouldStop === false) {
      stopped = true;
      return;
    }

    if (Array.isArray(node)) {
      const limit = Math.min(node.length, maxArrayItems);
      for (let index = 0; index < limit; index += 1) visit(node[index], [...pathSegments, String(index)]);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (stopped || visited >= maxNodes) return;
      if (value && typeof value === 'object') visit(value, [...pathSegments, key]);
    }
  }

  visit(root);
  return { visited, stopped };
}

function findStringByKeys(root, wantedKeys) {
  let found = '';
  const normalizedWanted = wantedKeys.map(normalizeSearchKey);

  walkJson(root, (node) => {
    if (Array.isArray(node)) return true;
    for (const [key, value] of Object.entries(node)) {
      const normalizedKey = normalizeSearchKey(key);
      if (normalizedWanted.some((wanted) => normalizedKey === wanted || normalizedKey.includes(wanted))) {
        const text = extractValueText(value).trim();
        if (text && text.length <= 120 && !/tagame\.|default__/i.test(text)) {
          found = text;
          return false;
        }
      }
    }
    return true;
  }, { maxNodes: 50000 });

  return found;
}

function findNumberByKeys(root, wantedKeys) {
  let found = null;
  const normalizedWanted = wantedKeys.map(normalizeSearchKey);

  walkJson(root, (node) => {
    if (Array.isArray(node)) return true;
    for (const [key, value] of Object.entries(node)) {
      const normalizedKey = normalizeSearchKey(key);
      if (normalizedWanted.some((wanted) => normalizedKey === wanted || normalizedKey.includes(wanted))) {
        const numericValue = toFiniteNumber(value);
        if (numericValue !== null && numericValue >= 0) {
          found = numericValue;
          return false;
        }
      }
    }
    return true;
  }, { maxNodes: 50000 });

  return found;
}

function readNumberFromObject(record, wantedKeys) {
  const normalizedWanted = wantedKeys.map(normalizeSearchKey);
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeSearchKey(key);
    if (normalizedWanted.some((wanted) => normalizedKey === wanted || normalizedKey.includes(wanted))) {
      const numericValue = toFiniteNumber(value);
      if (numericValue !== null) return numericValue;
    }
  }
  return 0;
}

function readStringFromObject(record, wantedKeys) {
  const normalizedWanted = wantedKeys.map(normalizeSearchKey);
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = normalizeSearchKey(key);
    if (normalizedWanted.some((wanted) => normalizedKey === wanted || normalizedKey.includes(wanted))) {
      const text = extractValueText(value).trim();
      if (text) return text;
    }
  }
  return '';
}

function normalizeTeam(value) {
  const text = extractValueText(value).toLowerCase();
  const numericValue = toFiniteNumber(value);
  if (text.includes('blue') || numericValue === 0) return 'Blue';
  if (text.includes('orange') || numericValue === 1) return 'Orange';
  return 'Unknown';
}


function extractRattletrapPrimitive(value) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (value.length === 2 && value[1] && typeof value[1] === 'object') {
      if ('Right' in value[1]) return value[1].Right;
      if ('Left' in value[1]) return value[1].Left;
    }
    return value;
  }

  if (typeof value !== 'object') return value;

  const record = value;
  if ('value' in record && record.value && typeof record.value === 'object') {
    return extractRattletrapPrimitive(record.value);
  }

  for (const key of ['int', 'float', 'bool', 'str', 'name', 'q_word']) {
    if (key in record) return record[key];
  }

  if ('byte' in record) return extractRattletrapPrimitive(record.byte);
  if ('array' in record) return record.array;
  if ('struct' in record) return record.struct;
  return record;
}

function rattletrapElementsToObject(elements) {
  const result = {};
  if (!Array.isArray(elements)) return result;

  for (const entry of elements) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [key, property] = entry;
    result[key] = extractRattletrapPrimitive(property);
  }

  return result;
}

function getRattletrapHeaderProperties(root) {
  const elements = root?.header?.body?.properties?.elements;
  return rattletrapElementsToObject(elements);
}

function normalizeRattletrapPlatform(value) {
  const text = safeString(extractRattletrapPrimitive(value));
  return text.replace(/^OnlinePlatform_/i, '') || 'Unknown';
}

function normalizeReplayTeamNumber(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === 0) return 'Blue';
  if (numeric === 1) return 'Orange';
  return normalizeTeam(value);
}

function getPlayerIdentityFromRattletrapStats(record) {
  const rawName = record.Name || record.PlayerName || record.DisplayName || '';
  const name = cleanPlayerName(rawName);
  if (!name) return null;

  const team = normalizeReplayTeamNumber(record.Team);
  return {
    id: `${name.toLowerCase()}-${team}`,
    name,
    team,
    platform: normalizeRattletrapPlatform(record.Platform),
  };
}

function extractRattletrapPlayerStats(root) {
  const properties = getRattletrapHeaderProperties(root);
  const playerStats = properties.PlayerStats;
  if (!Array.isArray(playerStats)) return [];

  return playerStats
    .map((entry, index) => {
      const record = rattletrapElementsToObject(entry?.elements);
      const identity = getPlayerIdentityFromRattletrapStats(record);
      if (!identity) return null;

      return {
        id: identity.id || `player-${index + 1}`,
        name: identity.name,
        team: identity.team,
        score: Math.max(0, Math.round(toFiniteNumber(record.Score) ?? 0)),
        goals: Math.max(0, Math.round(toFiniteNumber(record.Goals) ?? 0)),
        assists: Math.max(0, Math.round(toFiniteNumber(record.Assists) ?? 0)),
        saves: Math.max(0, Math.round(toFiniteNumber(record.Saves) ?? 0)),
        shots: Math.max(0, Math.round(toFiniteNumber(record.Shots) ?? 0)),
        demos: Math.max(0, Math.round(toFiniteNumber(record.Demos) ?? toFiniteNumber(record.Demolitions) ?? 0)),
        source: `rattletrap-header-playerstats${identity.platform !== 'Unknown' ? `:${identity.platform}` : ''}`,
      };
    })
    .filter(Boolean)
    .filter((player) => !isInternalReplayToken(player.name))
    .sort((a, b) => {
      if (a.team !== b.team) return a.team.localeCompare(b.team);
      return b.score - a.score;
    });
}

function extractRattletrapGoalEvents(root) {
  const properties = getRattletrapHeaderProperties(root);
  const goals = properties.Goals;
  const recordFps = toFiniteNumber(properties.RecordFPS) || 30;
  if (!Array.isArray(goals)) return [];

  return goals
    .map((entry, index) => {
      const record = rattletrapElementsToObject(entry?.elements);
      const frame = Math.max(0, Math.round(toFiniteNumber(record.frame) ?? 0));
      const playerName = cleanPlayerName(record.PlayerName) || 'Jugador no identificado';
      const team = normalizeReplayTeamNumber(record.PlayerTeam);
      const timestampSecond = recordFps > 0 ? Math.round(frame / recordFps) : 0;

      return {
        id: `goal-${index + 1}`,
        type: 'goal',
        timestampSecond,
        team,
        playerName,
        description: `Gol de ${playerName}${team !== 'Unknown' ? ` · ${team}` : ''}`,
        confidence: playerName !== 'Jugador no identificado' ? 'high' : 'medium',
      };
    })
    .filter((event) => event.playerName !== 'Jugador no identificado' || event.team !== 'Unknown');
}

function extractRattletrapMetadata(root, jsonSizeBytes, outputPath, topLevelKeys) {
  const properties = getRattletrapHeaderProperties(root);
  const teamSize = Math.max(0, Math.round(toFiniteNumber(properties.TeamSize) ?? 0));
  const matchType = safeString(properties.MatchType || 'Online');
  const modeLabel = teamSize > 0 ? `${teamSize}v${teamSize}` : '';
  const playlist = [matchType, modeLabel].filter(Boolean).join(' · ') || 'Modo no detectado';

  return {
    schema: detectReplaySchema(root),
    jsonPath: outputPath,
    jsonSizeBytes,
    topLevelKeys,
    replayName: safeString(properties.ReplayName || ''),
    replayId: safeString(properties.Id || ''),
    matchGuid: safeString(properties.MatchGUID || ''),
    mapName: safeString(properties.MapName || '') || 'Mapa no detectado',
    playlist,
    date: safeString(properties.Date || ''),
    durationSeconds: Math.round(toFiniteNumber(properties.TotalSecondsPlayed) ?? 0),
  };
}

function extractRattletrapScore(root, players) {
  const properties = getRattletrapHeaderProperties(root);
  const team0Score = toFiniteNumber(properties.Team0Score);
  const team1Score = toFiniteNumber(properties.Team1Score);

  const blueFromPlayers = players.filter((player) => player.team === 'Blue').reduce((sum, player) => sum + (player.goals || 0), 0);
  const orangeFromPlayers = players.filter((player) => player.team === 'Orange').reduce((sum, player) => sum + (player.goals || 0), 0);

  const blue = typeof team0Score === 'number' ? team0Score : blueFromPlayers;
  const orange = typeof team1Score === 'number' ? team1Score : orangeFromPlayers;

  return {
    blue: Math.max(0, Math.round(blue || 0)),
    orange: Math.max(0, Math.round(orange || 0)),
    confidence: typeof team0Score === 'number' || typeof team1Score === 'number' ? 'direct' : blueFromPlayers || orangeFromPlayers ? 'inferred_from_players' : 'unknown',
  };
}

function extractRattletrapHeaderReplayData(root, jsonSizeBytes, outputPath) {
  const topLevelKeys = root && typeof root === 'object' && !Array.isArray(root) ? Object.keys(root).slice(0, 18) : [];
  const properties = getRattletrapHeaderProperties(root);
  if (!Object.keys(properties).length) return null;

  const players = extractRattletrapPlayerStats(root);
  const score = extractRattletrapScore(root, players);
  const events = extractRattletrapGoalEvents(root);
  const metadata = extractRattletrapMetadata(root, jsonSizeBytes, outputPath, topLevelKeys);

  const metrics = createEmptyMetrics({
    goals: Math.max(score.blue + score.orange, events.filter((event) => event.type === 'goal').length),
    assists: players.reduce((sum, player) => sum + (player.assists || 0), 0),
    saves: players.reduce((sum, player) => sum + (player.saves || 0), 0),
    shots: players.reduce((sum, player) => sum + (player.shots || 0), 0),
    demos: players.reduce((sum, player) => sum + (player.demos || 0), 0),
    playerCount: players.length,
    detectedPlayers: players.map((player) => player.name),
    topLevelKeys,
    jsonSizeBytes,
  });

  return {
    metadata,
    players,
    score,
    events,
    metrics,
    extractionConfidence: players.length && score.confidence !== 'unknown' ? 'high' : players.length ? 'partial' : 'low',
    notes: [
      players.length ? `${players.length} jugadores leídos desde PlayerStats del header.` : 'No se encontraron PlayerStats confiables en el header.',
      score.confidence === 'direct' ? `Marcador directo leído del header: Blue ${score.blue} - Orange ${score.orange}.` : 'Marcador inferido desde los goles de jugadores.',
      events.length ? `${events.length} goles leídos desde Goals del header.` : 'No se encontraron goles en el header.',
    ],
  };
}

function findNamedPropertyValue(root, wantedNames) {
  const headerProperties = getRattletrapHeaderProperties(root);
  for (const wantedName of wantedNames) {
    const directValue = headerProperties[wantedName];
    if (typeof directValue !== 'undefined' && directValue !== null && directValue !== '') return safeString(directValue);
  }

  const wanted = wantedNames.map(normalizeSearchKey);
  let found = '';

  walkJson(root, (node) => {
    if (Array.isArray(node) || !node || typeof node !== 'object') return true;
    const record = node;
    let propertyName = '';
    for (const key of ['name', 'key', 'property', 'propertyName', 'PropertyName']) {
      if (key in record) {
        const candidate = extractValueText(record[key]).trim();
        if (candidate) propertyName = candidate;
      }
    }
    if (!propertyName) return true;
    const normalizedProperty = normalizeSearchKey(propertyName);
    if (!wanted.some((entry) => normalizedProperty === entry || normalizedProperty.includes(entry))) return true;

    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = normalizeSearchKey(key);
      if (['name', 'key', 'property', 'propertyname', 'type', 'kind'].includes(normalizedKey)) continue;
      const text = extractValueText(value).trim();
      if (text && text.length <= 160 && !isInternalReplayToken(text)) {
        found = text;
        return false;
      }
    }
    return true;
  }, { maxNodes: 90000, maxArrayItems: 9000 });

  return found;
}

function looksLikePlayerStatRecord(record, pathSegments) {
  const text = `${pathSegments.join(' ')} ${Object.keys(record).join(' ')}`.toLowerCase();
  const hasStatKey = ['goals', 'assists', 'saves', 'shots', 'score', 'demos', 'demolitions']
    .some((key) => text.includes(key));
  const hasPlayerContext = /player|stat|pri|online|reservation|team/.test(text);
  return hasPlayerContext && hasStatKey;
}

function extractPlayersDetailed(root) {
  const rattletrapPlayers = extractRattletrapPlayerStats(root);
  if (rattletrapPlayers.length) return rattletrapPlayers;

  const playersByKey = new Map();

  walkJson(root, (node, pathSegments) => {
    if (Array.isArray(node) || !node || typeof node !== 'object') return true;
    const record = node;
    if (!looksLikePlayerStatRecord(record, pathSegments)) return true;

    const rawName =
      readStringFromObject(record, ['playername', 'player_name', 'displayname', 'username', 'onlineid']) ||
      cleanPlayerName(record.PlayerName) ||
      cleanPlayerName(record.player);
    const name = cleanPlayerName(rawName);
    if (!name) return true;

    const goals = readNumberFromObject(record, ['goals', 'goalcount']);
    const assists = readNumberFromObject(record, ['assists']);
    const saves = readNumberFromObject(record, ['saves']);
    const shots = readNumberFromObject(record, ['shots']);
    const demos = readNumberFromObject(record, ['demos', 'demolitions']);
    const score = readNumberFromObject(record, ['score', 'matchscore', 'points']);
    const teamValue = readStringFromObject(record, ['team', 'teamindex', 'teamnum', 'teamcolor']) || record.team || record.Team || record.teamIndex;
    const team = normalizeTeam(teamValue);
    const key = `${name.toLowerCase()}-${team}`;
    const current = playersByKey.get(key);

    playersByKey.set(key, {
      id: key,
      name,
      team: team !== 'Unknown' ? team : current?.team ?? 'Unknown',
      score: Math.max(current?.score ?? 0, score),
      goals: Math.max(current?.goals ?? 0, goals),
      assists: Math.max(current?.assists ?? 0, assists),
      saves: Math.max(current?.saves ?? 0, saves),
      shots: Math.max(current?.shots ?? 0, shots),
      demos: Math.max(current?.demos ?? 0, demos),
      source: 'player-stat-object',
    });

    return playersByKey.size < 12;
  }, { maxNodes: 120000, maxArrayItems: 12000 });

  const players = Array.from(playersByKey.values())
    .filter((player) => isPlausiblePlayerName(player.name))
    .sort((a, b) => b.score + b.goals * 100 - (a.score + a.goals * 100))
    .slice(0, 12);

  return players;
}

function extractScore(root, players) {
  const rattletrapScore = extractRattletrapScore(root, players);
  if (rattletrapScore.confidence !== 'unknown') return rattletrapScore;

  const directBlue =
    findNumberByKeys(root, ['bluescore', 'teamscoreblue', 'blueteamscore', 'team0score']) ??
    findNumberByKeys(root, ['bluegoals']);
  const directOrange =
    findNumberByKeys(root, ['orangescore', 'teamscoreorange', 'orangeteamscore', 'team1score']) ??
    findNumberByKeys(root, ['orangegoals']);

  const inferredBlue = players.filter((player) => player.team === 'Blue').reduce((sum, player) => sum + (player.goals || 0), 0);
  const inferredOrange = players.filter((player) => player.team === 'Orange').reduce((sum, player) => sum + (player.goals || 0), 0);

  return {
    blue: typeof directBlue === 'number' ? directBlue : inferredBlue,
    orange: typeof directOrange === 'number' ? directOrange : inferredOrange,
    confidence: typeof directBlue === 'number' || typeof directOrange === 'number' ? 'direct' : inferredBlue || inferredOrange ? 'inferred_from_players' : 'unknown',
  };
}

function normalizeEventType(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('goal')) return 'goal';
  if (value.includes('save')) return 'save';
  if (value.includes('shot')) return 'shot';
  if (value.includes('assist')) return 'assist';
  if (value.includes('demo') || value.includes('demolish')) return 'demo';
  if (value.includes('miss')) return 'miss';
  if (value.includes('kickoff')) return 'kickoff';
  if (value.includes('touch')) return 'touch';
  return '';
}

function extractEvents(root) {
  const rattletrapEvents = extractRattletrapGoalEvents(root);
  if (rattletrapEvents.length) return rattletrapEvents;

  const events = [];
  const usedDescriptions = new Set();

  walkJson(root, (node, pathSegments) => {
    if (events.length >= 40 || Array.isArray(node) || !node || typeof node !== 'object') return events.length < 40;
    const record = node;
    const pathText = pathSegments.join(' ');
    const objectText = Object.entries(record)
      .slice(0, 18)
      .map(([key, value]) => `${key}:${extractValueText(value)}`)
      .join(' ');
    const haystack = `${pathText} ${objectText}`;
    const lower = haystack.toLowerCase();

    if (/goalvolume|car_ta|ball_ta|default__|tagame\.|spawned|replication|actor_id|object_id/.test(lower)) return true;
    const type = normalizeEventType(haystack);
    if (!type) return true;

    const hasReliableEventContext = /event|tickmark|stat|goal|save|shot|assist|demolition|gameevent/.test(pathText.toLowerCase()) &&
      /player|scorer|team|time|frame|score|goal|save|shot|assist|demo/.test(lower);
    if (!hasReliableEventContext) return true;

    const playerName = cleanPlayerName(readStringFromObject(record, ['playername', 'player', 'scorer', 'instigator', 'displayname', 'username'])) || 'Jugador no identificado';
    const team = normalizeTeam(readStringFromObject(record, ['team', 'teamindex', 'teamnum', 'teamcolor']) || record.team || record.Team);
    const timestampSecond =
      readNumberFromObject(record, ['timestampsecond', 'time', 'seconds', 'gametime', 'frame']) ||
      Math.max(0, events.length * 15);
    const description = `${type} · ${playerName}${team !== 'Unknown' ? ` · ${team}` : ''}`;
    const key = `${type}-${playerName}-${team}-${Math.round(timestampSecond)}`;
    if (usedDescriptions.has(key)) return true;
    usedDescriptions.add(key);

    events.push({
      id: `event-${events.length + 1}`,
      type,
      timestampSecond: Math.round(timestampSecond),
      team,
      playerName,
      description,
      confidence: playerName !== 'Jugador no identificado' || team !== 'Unknown' ? 'medium' : 'low',
    });

    return events.length < 40;
  }, { maxNodes: 120000, maxArrayItems: 12000 });

  return events.sort((a, b) => a.timestampSecond - b.timestampSecond).slice(0, 30);
}

function detectReplaySchema(json) {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    if (json.schema === 'rl-performance-lab.partial-replay.v1') return 'partial-replay-card';
    const keys = Object.keys(json).map((key) => key.toLowerCase());
    if (keys.includes('content') && keys.includes('header')) return 'rattletrap-like';
    if (keys.includes('properties') || keys.includes('objects')) return 'replay-json';
    if (keys.includes('network_frames') || keys.includes('frames')) return 'rrrocket-or-boxcars-like';
  }
  return 'unknown-json';
}

function extractReplayData(json, jsonSizeBytes, outputPath) {
  const rattletrapHeaderExtract = extractRattletrapHeaderReplayData(json, jsonSizeBytes, outputPath);
  if (rattletrapHeaderExtract) return rattletrapHeaderExtract;

  const topLevelKeys = json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json).slice(0, 18) : [];
  const players = extractPlayersDetailed(json);
  const score = extractScore(json, players);
  const events = extractEvents(json);
  const metadata = {
    schema: detectReplaySchema(json),
    jsonPath: outputPath,
    jsonSizeBytes,
    topLevelKeys,
    replayName: findNamedPropertyValue(json, ['ReplayName', 'ReplayTitle']) || findStringByKeys(json, ['replayname', 'replaytitle', 'title']) || '',
    replayId: findNamedPropertyValue(json, ['Id', 'ReplayId']) || findStringByKeys(json, ['id', 'replayid']) || '',
    matchGuid: findNamedPropertyValue(json, ['MatchGUID', 'MatchGuid']) || findStringByKeys(json, ['matchguid', 'matchid']) || '',
    mapName: findNamedPropertyValue(json, ['MapName', 'Map', 'Arena']) || findStringByKeys(json, ['mapname', 'arena']) || 'Mapa no detectado',
    playlist: findNamedPropertyValue(json, ['Playlist', 'PlaylistName', 'MatchType', 'GameMode']) || findStringByKeys(json, ['playlist', 'playlistname', 'matchtype']) || 'Modo no detectado',
    date: findNamedPropertyValue(json, ['Date', 'RecordDate', 'MatchDate']) || findStringByKeys(json, ['date', 'recordedat', 'matchdate']) || '',
    durationSeconds: Math.round(findNumberByKeys(json, ['durationseconds', 'duration', 'matchlength', 'totalseconds']) ?? 0),
  };
  const metrics = createEmptyMetrics({
    goals: Math.max(score.blue + score.orange, extractNumberNearKey(json, ['goals', 'goalcount'])),
    assists: Math.max(players.reduce((sum, player) => sum + (player.assists || 0), 0), extractNumberNearKey(json, ['assists'])),
    saves: Math.max(players.reduce((sum, player) => sum + (player.saves || 0), 0), extractNumberNearKey(json, ['saves'])),
    shots: Math.max(players.reduce((sum, player) => sum + (player.shots || 0), 0), extractNumberNearKey(json, ['shots'])),
    demos: Math.max(players.reduce((sum, player) => sum + (player.demos || 0), 0), extractNumberNearKey(json, ['demos', 'demolitions'])),
    playerCount: players.length,
    detectedPlayers: players.map((player) => player.name),
    topLevelKeys,
    jsonSizeBytes,
  });

  return {
    metadata,
    players,
    score,
    events,
    metrics,
    extractionConfidence: players.length || events.length || score.confidence !== 'unknown' ? 'partial' : 'low',
    notes: [
      players.length ? `${players.length} jugadores confiables detectados.` : 'No se detectaron jugadores reales con confianza. Se ignoraron actores internos como Car_TA, Ball_TA y GoalVolume_TA.',
      score.confidence === 'unknown' ? 'Marcador no detectado todavía.' : `Marcador ${score.confidence === 'direct' ? 'directo' : 'inferido'} detectado.`,
      events.length ? `${events.length} eventos confiables encontrados.` : 'Eventos granulares no detectados con confianza. Se evitaron falsos positivos de objetos internos del motor.',
    ],
  };
}

function readJsonPreview(outputPath) {
  try {
    const fileDescriptor = fs.openSync(outputPath, 'r');
    const buffer = Buffer.alloc(1800);
    const bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, 0);
    fs.closeSync(fileDescriptor);
    return buffer.toString('utf8', 0, bytesRead);
  } catch {
    return '';
  }
}

function analyzeJsonOutput(outputPath) {
  const stat = fs.statSync(outputPath);
  const rawPreview = readJsonPreview(outputPath);

  if (stat.size > MAX_JSON_PARSE_BYTES) {
    return {
      metrics: createEmptyMetrics({ jsonSizeBytes: stat.size }),
      replayExtract: {
        metadata: {
          schema: 'large-json',
          jsonPath: outputPath,
          jsonSizeBytes: stat.size,
          topLevelKeys: [],
          replayName: '',
          replayId: '',
          matchGuid: '',
          mapName: 'JSON demasiado grande',
          playlist: 'Pendiente',
          date: '',
          durationSeconds: 0,
        },
        players: [],
        score: { blue: 0, orange: 0, confidence: 'unknown' },
        events: [],
        metrics: createEmptyMetrics({ jsonSizeBytes: stat.size }),
        extractionConfidence: 'low',
        notes: ['JSON convertido, pero se omitió parseo completo para evitar congelar la app.'],
      },
      rawPreview,
      parseWarning: `JSON convertido, pero pesa ${(stat.size / 1024 / 1024).toFixed(1)} MB. Se omitió parseo completo para evitar congelar la app.`,
    };
  }

  try {
    const json = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const replayExtract = extractReplayData(json, stat.size, outputPath);
    return {
      metrics: replayExtract.metrics || extractBasicReplayMetrics(json, stat.size),
      replayExtract,
      rawPreview,
      parseWarning: '',
    };
  } catch (error) {
    return {
      metrics: createEmptyMetrics({ jsonSizeBytes: stat.size }),
      replayExtract: {
        metadata: {
          schema: 'invalid-json',
          jsonPath: outputPath,
          jsonSizeBytes: stat.size,
          topLevelKeys: [],
          replayName: '',
          replayId: '',
          matchGuid: '',
          mapName: 'JSON inválido',
          playlist: 'Pendiente',
          date: '',
          durationSeconds: 0,
        },
        players: [],
        score: { blue: 0, orange: 0, confidence: 'unknown' },
        events: [],
        metrics: createEmptyMetrics({ jsonSizeBytes: stat.size }),
        extractionConfidence: 'low',
        notes: [error instanceof Error ? error.message : 'El JSON convertido no pudo interpretarse completamente.'],
      },
      rawPreview,
      parseWarning: error instanceof Error ? error.message : 'El JSON convertido no pudo interpretarse completamente.',
    };
  }
}

function runRattletrapOnce({ rattletrapPath, replayPath, outputPath, args }) {
  return new Promise((resolve) => {
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // Si el archivo previo no puede eliminarse, Rattletrap intentará sobrescribirlo.
    }

    const child = spawn(rattletrapPath, args, {
      windowsHide: true,
      timeout: 180000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({ ok: false, message: error.message, stdout, stderr, args });
    });

    child.on('close', (code) => {
      const ok = code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
      resolve({ ok, code, stdout, stderr, message: stderr || stdout || '', args });
    });
  });
}

function normalizeParserOutput(text, maxLength = 2600) {
  if (!text) return '';
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, maxLength);
}

function detectParserProblem(text) {
  const output = text || '';
  const classMatch = output.match(/MissingClassName\s+"([^"]+)"/i);
  if (classMatch) {
    return {
      kind: 'missing_class',
      label: 'Clase de replay no soportada por Rattletrap',
      detail: `Rattletrap no reconoce ${classMatch[1]}. Probablemente el replay usa una clase añadida por un parche reciente de Rocket League.`,
    };
  }

  if (/crc/i.test(output)) {
    return {
      kind: 'crc',
      label: 'Validación CRC fallida',
      detail: 'El replay podría estar incompleto o Rattletrap rechazó la verificación de integridad.',
    };
  }

  if (/ENOENT|not found|no such file/i.test(output)) {
    return {
      kind: 'missing_binary',
      label: 'Parser no encontrado',
      detail: 'La app no pudo ejecutar el binario local configurado.',
    };
  }

  return {
    kind: 'unknown',
    label: 'Parser sin conversión completa',
    detail: 'El parser devolvió un error no clasificado. Se guardará una ficha parcial para no bloquear el flujo.',
  };
}

function createPartialReplayJson({ replayPath, outputPath, parserStatus, failures, attemptedParsers }) {
  const stat = fs.statSync(replayPath);
  const combinedOutput = failures
    .map((failure) => failure.stderr || failure.stdout || failure.message || '')
    .filter(Boolean)
    .join('\n---\n');
  const parserProblem = detectParserProblem(combinedOutput);
  const payload = {
    schema: 'rl-performance-lab.partial-replay.v1',
    status: 'partial',
    reason: parserProblem.label,
    detail: parserProblem.detail,
    createdAt: new Date().toISOString(),
    sourceReplay: {
      fileName: path.basename(replayPath),
      path: replayPath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    },
    parsers: {
      attempted: attemptedParsers,
      rattletrap: {
        available: Boolean(parserStatus.rattletrapAvailable),
        path: parserStatus.rattletrapPath,
      },
      rrrocket: {
        available: Boolean(parserStatus.rrrocketAvailable),
        path: parserStatus.rrrocketPath,
      },
    },
    failures: failures.map((failure, index) => ({
      attempt: index + 1,
      parser: failure.parser || 'unknown',
      command: [failure.executable || '', ...(failure.args || [])].filter(Boolean).join(' '),
      code: typeof failure.code === 'number' ? failure.code : null,
      problem: detectParserProblem(`${failure.stderr || ''}\n${failure.stdout || ''}\n${failure.message || ''}`),
      output: normalizeParserOutput(failure.stderr || failure.stdout || failure.message || ''),
    })),
    extracted: createEmptyMetrics({
      jsonSizeBytes: 0,
      topLevelKeys: ['partial', 'sourceReplay', 'parsers', 'failures'],
    }),
    nextAction: 'Instalar rrrocket.exe como parser alternativo o esperar un update de Rattletrap que soporte la clase nueva del replay.',
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return { outputPath, payload, parserProblem };
}

async function runRattletrapDecode({ replayPath, outputPath }) {
  const rattletrapPath = getRattletrapPath();
  if (!fs.existsSync(rattletrapPath)) {
    return { ok: false, parser: 'rattletrap', skipped: true, message: 'Rattletrap no está disponible.', failures: [] };
  }

  const attempts = [
    ['--mode', 'decode', '--input', replayPath, '--output', outputPath, '--compact'],
    ['--input', replayPath, '--output', outputPath, '--compact'],
    ['-i', replayPath, '-o', outputPath, '--compact'],
    ['--mode', 'decode', '--input', replayPath, '--output', outputPath, '--compact', '--fast'],
    ['--mode', 'decode', '--input', replayPath, '--output', outputPath, '--compact', '--skip-crc'],
    ['--mode', 'decode', '--input', replayPath, '--output', outputPath, '--compact', '--fast', '--skip-crc'],
  ];

  const failures = [];

  for (const args of attempts) {
    const result = await runRattletrapOnce({ rattletrapPath, replayPath, outputPath, args });
    if (result.ok) return { ...result, parser: 'rattletrap', failures };
    failures.push({ ...result, parser: 'rattletrap', executable: rattletrapPath });
  }

  const lastFailure = failures.at(-1) ?? { message: 'No se pudo ejecutar Rattletrap.', stdout: '', stderr: '', args: [] };
  return {
    ...lastFailure,
    parser: 'rattletrap',
    ok: false,
    failures,
    problem: detectParserProblem(failures.map((failure) => `${failure.stderr || ''}\n${failure.stdout || ''}\n${failure.message || ''}`).join('\n')),
  };
}

function looksLikeJson(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function findRrrocketSiblingJson(replayPath) {
  const replayDirectory = path.dirname(replayPath);
  const baseName = path.basename(replayPath, path.extname(replayPath));
  const candidates = [
    path.join(replayDirectory, `${baseName}.json`),
    path.join(replayDirectory, `${baseName}.replay.json`),
  ];

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).size > 0;
    } catch {
      return false;
    }
  });
}

function runRrrocketOnce({ rrrocketPath, replayPath, outputPath, args }) {
  return new Promise((resolve) => {
    const child = spawn(rrrocketPath, args, {
      cwd: path.dirname(replayPath),
      windowsHide: true,
      timeout: 180000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({ ok: false, message: error.message, stdout, stderr, args });
    });

    child.on('close', (code) => {
      try {
        if (code === 0 && stdout && looksLikeJson(stdout)) {
          fs.writeFileSync(outputPath, stdout, 'utf8');
          resolve({ ok: true, code, stdout, stderr, args });
          return;
        }

        const siblingJson = findRrrocketSiblingJson(replayPath);
        if (code === 0 && siblingJson) {
          fs.copyFileSync(siblingJson, outputPath);
          resolve({ ok: true, code, stdout, stderr, args, siblingJson });
          return;
        }
      } catch (error) {
        resolve({ ok: false, code, stdout, stderr, message: error instanceof Error ? error.message : 'No se pudo copiar el JSON de rrrocket.', args });
        return;
      }

      resolve({ ok: false, code, stdout, stderr, message: stderr || stdout || '', args });
    });
  });
}

async function runRrrocketDecode({ replayPath, outputPath }) {
  const rrrocketPath = getRrrocketPath();
  if (!fs.existsSync(rrrocketPath)) {
    return { ok: false, parser: 'rrrocket', skipped: true, message: 'rrrocket no está disponible.', failures: [] };
  }

  const attempts = [
    ['--pretty', replayPath],
    [replayPath],
    ['--network-parse', '--pretty', replayPath],
  ];

  const failures = [];

  for (const args of attempts) {
    const result = await runRrrocketOnce({ rrrocketPath, replayPath, outputPath, args });
    if (result.ok) return { ...result, parser: 'rrrocket', failures };
    failures.push({ ...result, parser: 'rrrocket', executable: rrrocketPath });
  }

  const lastFailure = failures.at(-1) ?? { message: 'No se pudo ejecutar rrrocket.', stdout: '', stderr: '', args: [] };
  return {
    ...lastFailure,
    parser: 'rrrocket',
    ok: false,
    failures,
    problem: detectParserProblem(failures.map((failure) => `${failure.stderr || ''}\n${failure.stdout || ''}\n${failure.message || ''}`).join('\n')),
  };
}

async function runReplayParserPipeline({ replayPath, outputPath }) {
  const parserStatus = getRattletrapStatus();
  const allFailures = [];
  const attemptedParsers = [];

  if (parserStatus.rattletrapAvailable) {
    attemptedParsers.push('rattletrap');
    const rattletrapResult = await runRattletrapDecode({ replayPath, outputPath });
    if (rattletrapResult.ok) return { ...rattletrapResult, parserStatus, mode: 'full' };
    allFailures.push(...(rattletrapResult.failures?.length ? rattletrapResult.failures : [rattletrapResult]));
  }

  if (parserStatus.rrrocketAvailable) {
    attemptedParsers.push('rrrocket');
    const rrrocketResult = await runRrrocketDecode({ replayPath, outputPath });
    if (rrrocketResult.ok) return { ...rrrocketResult, parserStatus, mode: 'fallback' };
    allFailures.push(...(rrrocketResult.failures?.length ? rrrocketResult.failures : [rrrocketResult]));
  }

  const partialPath = outputPath.replace(/\.json$/i, '.partial.json');
  const partial = createPartialReplayJson({ replayPath, outputPath: partialPath, parserStatus, failures: allFailures, attemptedParsers });

  return {
    ok: true,
    parser: 'partial',
    mode: 'partial',
    outputPath: partial.outputPath,
    parserStatus,
    partialReason: partial.parserProblem.label,
    partialDetail: partial.parserProblem.detail,
    failures: allFailures,
  };
}


function resolveLaunchLogPath() {
  const candidates = [
    path.join(os.homedir(), 'OneDrive', 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log'),
    path.join(os.homedir(), 'Documents', 'My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Se prueba la siguiente ruta.
    }
  }

  return candidates[0];
}

function tierFromNumber(tierNumber) {
  const tiers = [
    'Sin rango',
    'Bronze I', 'Bronze II', 'Bronze III',
    'Silver I', 'Silver II', 'Silver III',
    'Gold I', 'Gold II', 'Gold III',
    'Platinum I', 'Platinum II', 'Platinum III',
    'Diamond I', 'Diamond II', 'Diamond III',
    'Champion I', 'Champion II', 'Champion III',
    'Grand Champion I', 'Grand Champion II', 'Grand Champion III',
    'Supersonic Legend',
  ];
  const value = Number(tierNumber);
  if (!Number.isFinite(value)) return 'Sin rango';
  return tiers[Math.max(0, Math.min(tiers.length - 1, value))] ?? 'Sin rango';
}

function divisionFromNumber(divisionNumber) {
  const divisions = ['I', 'II', 'III', 'IV'];
  const value = Number(divisionNumber);
  if (!Number.isFinite(value)) return 'Sin división';
  return divisions[Math.max(0, Math.min(3, value))] ?? 'Sin división';
}

function playlistFromText(text) {
  const source = String(text || '').toLowerCase();
  if (/\b(10|duel|1v1|solo duel|ranked duel)\b/.test(source)) return '1v1';
  if (/\b(11|doubles|2v2|ranked doubles)\b/.test(source)) return '2v2';
  if (/\b(13|standard|3v3|ranked standard)\b/.test(source)) return '3v3';
  return null;
}

function parseRankSnapshotFromLine(line, previousLine = '') {
  const text = `${previousLine} ${line}`;
  if (!/(mmr|skill\s*rating|skillrating|rank|tier|division|playlist)/i.test(text)) return null;

  const mmrMatch = text.match(/(?:mmr|skill\s*rating|skillrating)[^0-9-]{0,24}(-?\d{2,5})/i);
  if (!mmrMatch) return null;

  const playlist = playlistFromText(text) ?? '2v2';
  const tierMatch = text.match(/(?:tier|rank(?:ed)?\s*tier)[^0-9]{0,18}(\d{1,2})/i);
  const divisionMatch = text.match(/(?:division|div)[^0-9]{0,18}(\d{1,2})/i);
  const namedTierMatch = text.match(/(bronze|silver|gold|platinum|diamond|champion|grand\s*champion|supersonic\s*legend)\s*(i{1,3}|iv|1|2|3)?/i);
  const namedDivisionMatch = text.match(/division\s*(i{1,3}|iv|1|2|3|4)/i);

  const tier = namedTierMatch
    ? namedTierMatch[0].replace(/division.*/i, '').trim().replace(/\s+/g, ' ')
    : tierFromNumber(tierMatch?.[1]);
  const division = namedDivisionMatch
    ? String(namedDivisionMatch[1]).toUpperCase().replace('1', 'I').replace('2', 'II').replace('3', 'III').replace('4', 'IV')
    : divisionFromNumber(divisionMatch?.[1]);
  const mmr = Number(mmrMatch[1]) || 0;

  return {
    id: `launch-log-${playlist}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    capturedAt: new Date().toISOString(),
    playlist,
    tier: tier || 'Sin rango',
    division: division || 'Sin división',
    mmr,
    mmrDelta: 0,
    gamesToNextRank: 0,
    progressToNextRank: 0,
    source: 'launch_log',
    evidenceLine: line.trim().slice(0, 420),
  };
}



function getRocketLeagueInstallConfigCandidates() {
  const candidates = [];
  const envCandidates = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.PROGRAMW6432].filter(Boolean);
  const installRoots = [
    ...envCandidates.map((root) => path.join(root, 'Epic Games', 'rocketleague')),
    ...envCandidates.map((root) => path.join(root, 'Steam', 'steamapps', 'common', 'rocketleague')),
    ...envCandidates.map((root) => path.join(root, 'SteamLibrary', 'steamapps', 'common', 'rocketleague')),
    path.join('C:', 'Program Files', 'Epic Games', 'rocketleague'),
    path.join('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'common', 'rocketleague'),
  ];

  for (const root of installRoots) {
    candidates.push(path.join(root, 'TAGame', 'Config', 'DefaultStatsAPI.ini'));
  }

  return [...new Set(candidates)];
}

function resolveStatsApiConfigPath() {
  const config = readDesktopConfig();
  if (typeof config.statsApiConfigPath === 'string' && config.statsApiConfigPath.trim()) return config.statsApiConfigPath;
  const candidates = getRocketLeagueInstallConfigCandidates();
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getIniSectionLines(content, section) {
  const lines = String(content || '').split(/\r?\n/);
  const sectionRegex = new RegExp(`^\\s*\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\$&')}\\]\\s*$`, 'i');
  const start = lines.findIndex((line) => sectionRegex.test(line));
  if (start < 0) return [];
  const output = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index])) break;
    output.push(lines[index]);
  }
  return output;
}

function getIniSectionValue(content, section, key) {
  const keyRegex = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\$&')}\\s*=\\s*(.+?)\\s*$`, 'i');
  for (const line of getIniSectionLines(content, section)) {
    const match = line.match(keyRegex);
    if (match) return match[1];
  }
  return '';
}

function getStatsApiConfigStatus() {
  const config = readDesktopConfig();
  const configPath = resolveStatsApiConfigPath();
  const fallbackPort = Number(config.statsApiPort) || 49123;
  const fallbackPacketSendRate = Number(config.statsApiPacketSendRate) || 10;
  const exists = Boolean(configPath && fs.existsSync(configPath));
  let content = '';
  try {
    if (exists) content = fs.readFileSync(configPath, 'utf8');
  } catch {
    content = '';
  }

  const officialSection = 'TAGame.MatchStatsExporter_TA';
  const officialPacket = getIniSectionValue(content, officialSection, 'PacketSendRate');
  const officialPort = getIniSectionValue(content, officialSection, 'Port');
  const legacyPacket = getIniSectionValue(content, 'StatsAPI', 'PacketSendRate');
  const legacyPort = getIniSectionValue(content, 'StatsAPI', 'Port');
  const packetSendRate = Number(officialPacket || legacyPacket || fallbackPacketSendRate) || fallbackPacketSendRate;
  const port = Number(officialPort || legacyPort || fallbackPort) || fallbackPort;
  const configured = Boolean(Number(officialPacket) > 0 && Number(officialPort) > 0);

  return {
    ok: exists,
    configured,
    configPath,
    port,
    packetSendRate,
    websocketUrl: `ws://127.0.0.1:${port}`,
    candidates: getRocketLeagueInstallConfigCandidates(),
    message: exists
      ? configured
        ? 'Stats API oficial configurada en [TAGame.MatchStatsExporter_TA]. Cerrá completamente Rocket League, abrilo de nuevo y entrá a partida real/exhibición/online antes de conectar.'
        : 'Se encontró DefaultStatsAPI.ini, pero la sección oficial [TAGame.MatchStatsExporter_TA] está apagada o incompleta. Activá Stats API desde la app y reiniciá Rocket League.'
      : 'No se encontró DefaultStatsAPI.ini automáticamente. Seleccioná el archivo desde la carpeta de instalación de Rocket League.',
  };
}

function upsertIniValue(content, section, key, value) {
  const lines = String(content || '').split(/\r?\n/);
  const sectionRegex = new RegExp(`^\\s*\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\$&')}\\]\\s*$`, 'i');
  const keyRegex = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\$&')}\\s*=`, 'i');
  let sectionStart = lines.findIndex((line) => sectionRegex.test(line));
  if (sectionStart < 0) {
    if (lines.length && lines[lines.length - 1].trim()) lines.push('');
    lines.push(`[${section}]`);
    lines.push(`${key}=${value}`);
    return lines.join('\n');
  }

  let insertAt = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[index])) {
      insertAt = index;
      break;
    }
    if (keyRegex.test(lines[index])) {
      lines[index] = `${key}=${value}`;
      return lines.join('\n');
    }
  }
  lines.splice(insertAt, 0, `${key}=${value}`);
  return lines.join('\n');
}


function emitStatsApiStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('stats-api:status', {
    at: new Date().toISOString(),
    ...status,
  });
}

function emitStatsApiMessage(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('stats-api:message', payload);
}

function extractJsonObjectsFromStatsStream(input) {
  const messages = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (char === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        messages.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }

  const remainder = depth > 0 && start >= 0 ? input.slice(start) : '';
  return { messages, remainder };
}

function handleStatsApiRawChunk(chunk) {
  statsApiLiveBuffer += chunk.toString('utf8');
  if (statsApiLiveBuffer.length > 1024 * 1024) {
    statsApiLiveBuffer = statsApiLiveBuffer.slice(-512 * 1024);
  }

  const { messages, remainder } = extractJsonObjectsFromStatsStream(statsApiLiveBuffer);
  statsApiLiveBuffer = remainder;

  for (const raw of messages) {
    try {
      const parsed = JSON.parse(raw);
      statsApiLiveMessageCount += 1;
      emitStatsApiMessage(parsed);
      emitStatsApiStatus({
        ok: true,
        connected: true,
        connecting: false,
        mode: 'raw-tcp',
        host: statsApiLiveHost,
        port: statsApiLivePort,
        messageCount: statsApiLiveMessageCount,
        message: `Stats API raw TCP leyendo eventos (${statsApiLiveMessageCount}).`,
      });
    } catch (error) {
      emitStatsApiStatus({
        ok: false,
        connected: Boolean(statsApiLiveSocket),
        connecting: false,
        mode: 'raw-tcp',
        host: statsApiLiveHost,
        port: statsApiLivePort,
        message: `Se recibió data pero no se pudo parsear JSON: ${error instanceof Error ? error.message : 'error desconocido'}`,
      });
    }
  }
}

function stopStatsApiStream() {
  statsApiLiveManualStop = true;
  if (statsApiLiveReconnectTimer) {
    clearTimeout(statsApiLiveReconnectTimer);
    statsApiLiveReconnectTimer = null;
  }
  if (statsApiLiveSocket) {
    try { statsApiLiveSocket.destroy(); } catch { /* ignore */ }
    statsApiLiveSocket = null;
  }
  statsApiLiveBuffer = '';
  emitStatsApiStatus({ ok: true, connected: false, connecting: false, mode: 'raw-tcp', port: statsApiLivePort, message: 'Stats API monitor detenido.' });
  return { ok: true, connected: false, connecting: false, port: statsApiLivePort, message: 'Stats API monitor detenido.' };
}

function scheduleStatsApiReconnect(reason) {
  if (statsApiLiveManualStop) return;
  if (statsApiLiveReconnectTimer) clearTimeout(statsApiLiveReconnectTimer);
  emitStatsApiStatus({
    ok: false,
    connected: false,
    connecting: true,
    mode: 'raw-tcp',
    host: statsApiLiveHost,
    port: statsApiLivePort,
    message: `${reason} Reintentando como socket TCP local.`,
  });
  statsApiLiveReconnectTimer = setTimeout(() => {
    statsApiLiveReconnectTimer = null;
    startStatsApiStream({ port: statsApiLivePort, host: statsApiLiveHost, silent: true });
  }, 1800);
}

function startStatsApiStream(payload = {}) {
  statsApiLiveManualStop = false;
  statsApiLivePort = Number(payload.port) > 0 ? Number(payload.port) : 49123;
  statsApiLiveHost = String(payload.host || '127.0.0.1');
  statsApiLiveBuffer = '';

  if (statsApiLiveSocket) {
    try { statsApiLiveSocket.destroy(); } catch { /* ignore */ }
    statsApiLiveSocket = null;
  }

  emitStatsApiStatus({
    ok: true,
    connected: false,
    connecting: true,
    mode: 'raw-tcp',
    host: statsApiLiveHost,
    port: statsApiLivePort,
    message: `Conectando a Rocket League Stats API por socket TCP en ${statsApiLiveHost}:${statsApiLivePort}.`,
  });

  const socket = net.createConnection({ host: statsApiLiveHost, port: statsApiLivePort });
  statsApiLiveSocket = socket;
  socket.setKeepAlive(true, 1000);
  socket.setTimeout(0);

  socket.on('connect', () => {
    emitStatsApiStatus({
      ok: true,
      connected: true,
      connecting: false,
      mode: 'raw-tcp',
      host: statsApiLiveHost,
      port: statsApiLivePort,
      message: 'Conectado al socket TCP de Rocket League. Esperando UpdateState/BallHit.',
    });
  });

  socket.on('data', handleStatsApiRawChunk);

  socket.on('error', (error) => {
    if (statsApiLiveManualStop) return;
    if (statsApiLiveSocket === socket) statsApiLiveSocket = null;
    scheduleStatsApiReconnect(`Stats API no está abierta (${error.code || error.message}).`);
  });

  socket.on('close', () => {
    if (statsApiLiveSocket === socket) statsApiLiveSocket = null;
    if (!statsApiLiveManualStop) scheduleStatsApiReconnect('Rocket League cerró el socket o aún no lo abrió.');
  });

  return {
    ok: true,
    connected: false,
    connecting: true,
    mode: 'raw-tcp',
    host: statsApiLiveHost,
    port: statsApiLivePort,
    message: 'Monitor iniciado. La raíz del problema era que la app intentaba WebSocket de navegador; ahora usa socket TCP local desde Electron.',
  };
}

function checkStatsApiHostWithTcp(host, port = 49123) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1400;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish({ ok: true, host, port, mode: 'raw-tcp', message: `Socket TCP abierto en ${host}:${port}.` }));
    socket.once('timeout', () => finish({ ok: false, host, port, mode: 'raw-tcp', message: `${host}:${port} no responde todavía.` }));
    socket.once('error', (error) => finish({ ok: false, host, port, mode: 'raw-tcp', message: `${host}:${port} cerrado (${error.code || error.message}).` }));
    socket.connect(port, host);
  });
}

function checkStatsApiHostWithWebSocketHandshake(host, port = 49123) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 1400;
    let done = false;
    let response = '';
    const key = crypto.randomBytes(16).toString('base64');
    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => {
      const hostHeader = host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
      socket.write([
        'GET / HTTP/1.1',
        `Host: ${hostHeader}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (/HTTP\/1\.1\s+101/i.test(response) || /Switching Protocols/i.test(response)) {
        finish({ ok: true, host, port, message: `WebSocket Stats API respondió en ${host}:${port}.` });
      } else if (response.includes('\r\n\r\n')) {
        finish({ ok: false, host, port, message: `Puerto ${host}:${port} respondió, pero no aceptó handshake WebSocket. Respuesta: ${response.split(/\r?\n/)[0] || 'sin status'}` });
      }
    });
    socket.once('timeout', () => finish({ ok: false, host, port, message: `${host}:${port} no responde todavía.` }));
    socket.once('error', (error) => finish({ ok: false, host, port, message: `${host}:${port} cerrado (${error.code || error.message}).` }));
    socket.connect(port, host);
  });
}

async function checkStatsApiPort(port = 49123) {
  const hosts = ['127.0.0.1', 'localhost', '::1'];
  const results = [];
  for (const host of hosts) {
    const result = await checkStatsApiHostWithTcp(host, port);
    results.push(result);
    if (result.ok) return { ...result, port, message: `${result.message} Usá Conectar live; la app leerá el stream TCP en Electron.` };
  }
  return {
    ok: false,
    port,
    hosts: results,
    mode: 'raw-tcp',
    message: `Stats API no abrió socket TCP en ${hosts.map((host) => `${host}:${port}`).join(', ')}. Confirmá: 1) DefaultStatsAPI.ini está en la instalación real, 2) PacketSendRate > 0 en [TAGame.MatchStatsExporter_TA], 3) Rocket League fue cerrado por completo y abierto después, 4) estás en Exhibition/Private/Online, no Training Browser.`,
  };
}

function configureStatsApi(configPath, port = 49123, packetSendRate = 10) {
  const safePort = Number(port) > 0 ? Number(port) : 49123;
  const safeRate = Number(packetSendRate) > 0 ? Math.min(120, Number(packetSendRate)) : 10;
  const targetPath = configPath || resolveStatsApiConfigPath();
  if (!targetPath) return { ...getStatsApiConfigStatus(), ok: false, message: 'No hay ruta de DefaultStatsAPI.ini seleccionada.' };
  const dir = path.dirname(targetPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
    let content = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';

    // Rocket League lee esta sección oficial. La sección [StatsAPI] no abre el socket por sí sola.
    content = upsertIniValue(content, 'TAGame.MatchStatsExporter_TA', 'Port', String(safePort));
    content = upsertIniValue(content, 'TAGame.MatchStatsExporter_TA', 'PacketSendRate', String(safeRate));

    // Mantener compatibilidad con versiones antiguas del parche, pero la sección oficial manda.
    content = upsertIniValue(content, 'StatsAPI', 'Port', String(safePort));
    content = upsertIniValue(content, 'StatsAPI', 'PacketSendRate', String(safeRate));

    fs.writeFileSync(targetPath, content, 'utf8');
    writeDesktopConfig({ statsApiConfigPath: targetPath, statsApiPort: safePort, statsApiPacketSendRate: safeRate });
    return {
      ...getStatsApiConfigStatus(),
      ok: true,
      configured: true,
      port: safePort,
      packetSendRate: safeRate,
      websocketUrl: `ws://127.0.0.1:${safePort}`,
      message: 'Stats API activada en [TAGame.MatchStatsExporter_TA] con PacketSendRate activo. Cerrá Rocket League por completo, abrilo de nuevo y entrá a partida real/exhibición/online antes de Probar puerto o Conectar live.',
    };
  } catch (error) {
    return {
      ...getStatsApiConfigStatus(),
      ok: false,
      configured: false,
      configPath: targetPath,
      port: safePort,
      packetSendRate: safeRate,
      websocketUrl: `ws://127.0.0.1:${safePort}`,
      message: `No se pudo escribir DefaultStatsAPI.ini. Ejecutá la app como administrador o seleccioná una ruta con permisos. ${error instanceof Error ? error.message : ''}`,
    };
  }
}

function uniqueExistingDirectories(candidates) {
  const seen = new Set();
  const directories = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) directories.push(candidate);
    } catch {
      // probar siguiente ruta
    }
  }
  return directories;
}

function getDocumentsCandidates() {
  return getPreferredDocumentsCandidates();
}

function inferDocumentsFromMyTrainingDirectory(myTrainingDirectory) {
  const normalized = String(myTrainingDirectory || '');
  const marker = `${path.sep}My Games${path.sep}Rocket League${path.sep}TAGame${path.sep}Training`;
  const lower = normalized.toLowerCase();
  const markerIndex = lower.indexOf(marker.toLowerCase());
  if (markerIndex <= 0) return '';
  return normalized.slice(0, markerIndex);
}

function resolveRocketLeagueDocumentsDirectory() {
  const config = readDesktopConfig();
  const fromSelected = inferDocumentsFromMyTrainingDirectory(config.selectedMyTrainingDirectory);
  if (fromSelected && directoryExists(path.join(fromSelected, 'My Games', 'Rocket League', 'TAGame', 'Training'))) return fromSelected;

  for (const documentsPath of getDocumentsCandidates()) {
    if (directoryExists(path.join(documentsPath, 'My Games', 'Rocket League', 'TAGame', 'Training'))) return documentsPath;
  }

  return getDocumentsCandidates()[0];
}

function resolveRlaTrainingPackLandingDirectory() {
  const rocketDocuments = resolveRocketLeagueDocumentsDirectory();
  const preferred = path.join(rocketDocuments, 'My Games', 'RLA', 'training_packs');
  return preferred;
}

function getRocketTrainingRootCandidates() {
  return getDocumentsCandidates().map((documentsPath) => path.join(documentsPath, 'My Games', 'Rocket League', 'TAGame'));
}

function resolveRocketTrainingRoot() {
  const candidates = getRocketTrainingRootCandidates();
  const existing = uniqueExistingDirectories(candidates);
  return existing[0] ?? candidates[0];
}

function findTrainingRoots() {
  const roots = uniqueExistingDirectories(getRocketTrainingRootCandidates());
  if (roots.length) return roots;
  return [resolveRocketTrainingRoot()];
}

function findMyTrainingDirectories() {
  const found = [];
  const selected = readDesktopConfig().selectedMyTrainingDirectory;
  if (typeof selected === 'string' && selected.trim() && fs.existsSync(selected)) found.push(selected);

  function walk(current, depth = 0) {
    if (depth > 7 || found.length > 60) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    if (path.basename(current).toLowerCase() === 'mytraining') {
      if (!found.some((item) => item.toLowerCase() === current.toLowerCase())) found.push(current);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const next = path.join(current, entry.name);
      if (/^(demos|logs|cache|config|movies|webcache|__pycache__)$/i.test(entry.name)) continue;
      walk(next, depth + 1);
    }
  }

  for (const root of findTrainingRoots()) walk(root, 0);
  return found;
}

function findExistingPackDraftFolders() {
  const landing = resolveRlaTrainingPackLandingDirectory();
  try {
    fs.mkdirSync(landing, { recursive: true });
    return fs.readdirSync(landing, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(landing, entry.name))
      .filter((folder) => fs.existsSync(path.join(folder, 'pack.rla.json')) || fs.existsSync(path.join(folder, 'shots.json')))
      .map((folder) => {
        let mtimeMs = 0;
        try {
          const manifest = path.join(folder, 'pack.rla.json');
          const shots = path.join(folder, 'shots.json');
          const statTarget = fs.existsSync(manifest) ? manifest : shots;
          mtimeMs = fs.statSync(statTarget).mtimeMs;
        } catch { /* ignore broken draft folders */ }
        return { folder, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((entry) => entry.folder)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function directorySizeBytes(directory) {
  let total = 0;
  function walk(current, depth = 0) {
    if (depth > 8) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) walk(next, depth + 1);
        else if (entry.isFile()) total += fs.statSync(next).size;
      } catch {
        // Ignorar archivos bloqueados por el juego.
      }
    }
  }
  walk(directory);
  return total;
}

function countFiles(directory) {
  let total = 0;
  function walk(current, depth = 0) {
    if (depth > 8) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next, depth + 1);
      else if (entry.isFile()) total += 1;
    }
  }
  walk(directory);
  return total;
}

function findTrainingPackTemplateDirectories() {
  const templates = [];
  const selected = readDesktopConfig().selectedTrainingTemplateDirectory;
  const targetMyTraining = resolveDefaultMyTrainingDirectory();

  function addTemplateDirectory(candidatePath, source) {
    if (!candidatePath || !fs.existsSync(candidatePath)) return;

    let templateDirectory = candidatePath;
    let selectedTemPath = '';
    let packRoot = path.dirname(candidatePath);

    try {
      const stat = fs.statSync(candidatePath);
      if (stat.isFile()) {
        if (!/\.tem$/i.test(candidatePath)) return;
        selectedTemPath = candidatePath;
        templateDirectory = path.dirname(candidatePath);
        packRoot = path.basename(templateDirectory).toLowerCase() === 'mytraining'
          ? path.dirname(templateDirectory)
          : templateDirectory;
      }
    } catch {
      return;
    }

    if (!selectedTemPath
      && path.basename(candidatePath).toLowerCase() !== 'mytraining'
      && !/^(downloaded|favorites|favorities)$/i.test(path.basename(candidatePath))) {
      const nested = path.join(candidatePath, 'MyTraining');
      if (fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
        packRoot = candidatePath;
        templateDirectory = nested;
      }
    }

    let temFiles = findTemFiles(templateDirectory);
    if (selectedTemPath) {
      temFiles = [selectedTemPath, ...temFiles.filter((filePath) => filePath.toLowerCase() !== selectedTemPath.toLowerCase())];
    }
    if (!temFiles.length) return;

    const normalized = (selectedTemPath || templateDirectory).toLowerCase();
    if (templates.some((template) => ((template.selectedTemPath || template.templateDirectory) || '').toLowerCase() === normalized)) return;

    let updatedAt = '';
    let biggestTemSize = 0;
    try { updatedAt = fs.statSync(selectedTemPath || templateDirectory).mtime.toISOString(); } catch { updatedAt = ''; }
    for (const tem of temFiles) {
      try { biggestTemSize = Math.max(biggestTemSize, fs.statSync(tem).size); } catch { /* ignore */ }
    }
    const name = selectedTemPath
      ? path.basename(selectedTemPath, path.extname(selectedTemPath))
      : path.basename(templateDirectory).toLowerCase() === 'mytraining'
        ? path.basename(packRoot)
        : path.basename(templateDirectory);
    templates.push({
      id: Buffer.from(selectedTemPath || templateDirectory).toString('base64url'),
      name,
      packRoot,
      myTrainingDirectory: templateDirectory, // compat: source template directory
      templateDirectory,
      selectedTemPath,
      selectedTemFileName: selectedTemPath ? path.basename(selectedTemPath) : '',
      installTargetMyTrainingDirectory: directoryExists(targetMyTraining) ? targetMyTraining : '',
      fileCount: selectedTemPath ? 1 : temFiles.length,
      temCount: selectedTemPath ? 1 : temFiles.length,
      biggestTemSize,
      sizeBytes: selectedTemPath ? biggestTemSize : directorySizeBytes(templateDirectory),
      updatedAt,
      source,
    });
  }

  if (typeof selected === 'string' && selected.trim()) addTemplateDirectory(selected, 'manual');

  // Buscar plantillas en la estructura real de Rocket League:
  // Training\0000000000000000\MyTraining, Downloaded y Favorities/Favorites.
  const accountRoots = new Set();
  for (const root of findTrainingRoots()) {
    try {
      const trainingDir = path.join(root, 'Training');
      const entries = fs.readdirSync(trainingDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) accountRoots.add(path.join(trainingDir, entry.name));
      }
    } catch {
      // ignore
    }
  }
  for (const myTraining of findMyTrainingDirectories()) {
    addTemplateDirectory(myTraining, 'detected-mytraining');
    accountRoots.add(path.dirname(myTraining));
  }
  for (const accountRoot of accountRoots) {
    addTemplateDirectory(path.join(accountRoot, 'MyTraining'), 'detected-mytraining');
    addTemplateDirectory(path.join(accountRoot, 'Downloaded'), 'detected-downloaded');
    addTemplateDirectory(path.join(accountRoot, 'Favorites'), 'detected-favorites');
    addTemplateDirectory(path.join(accountRoot, 'Favorities'), 'detected-favorites');
  }

  const hasManual = templates.some((template) => template.source === 'manual');
  return templates.sort((a, b) => {
    if (a.source === 'manual' && b.source !== 'manual') return -1;
    if (b.source === 'manual' && a.source !== 'manual') return 1;
    // Si no hay manual, preferir plantillas con más .Tem y mayor tamaño para evitar 0/0.
    if (!hasManual) {
      const scoreA = (a.temCount || a.fileCount || 0) * 100000 + (a.biggestTemSize || 0);
      const scoreB = (b.temCount || b.fileCount || 0) * 100000 + (b.biggestTemSize || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
    }
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  }).slice(0, 30);
}

function copyDirectoryRecursive(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectoryRecursive(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}


function normalizePathForCompare(value) {
  return path.resolve(String(value || '')).toLowerCase();
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function getTrainingSafetyDirectory() {
  const directory = path.join(app.getPath('userData'), 'training-pack-safety');
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function getLastTrainingInstallRecordPath() {
  return path.join(getTrainingSafetyDirectory(), 'last-install-record.json');
}

function readLastTrainingInstallRecord() {
  try {
    const recordPath = getLastTrainingInstallRecordPath();
    if (!fs.existsSync(recordPath)) return null;
    return JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch {
    return null;
  }
}

function getAccountRootFromMyTrainingDirectory(myTrainingDirectory) {
  if (!myTrainingDirectory) return '';
  const normalized = path.resolve(myTrainingDirectory);
  if (path.basename(normalized).toLowerCase() !== 'mytraining') return '';
  return path.dirname(normalized);
}

function assertSafeMyTrainingTarget(myTrainingDirectory) {
  if (!myTrainingDirectory || !directoryExists(myTrainingDirectory)) {
    throw new Error('No se detectó carpeta MyTraining destino. Ruta esperada: Training\\0000000000000000\\MyTraining.');
  }

  const basename = path.basename(myTrainingDirectory).toLowerCase();
  const parent = path.basename(path.dirname(myTrainingDirectory)).toLowerCase();
  const lower = myTrainingDirectory.toLowerCase();
  if (basename !== 'mytraining' || parent !== '0000000000000000' || /\\(downloaded|favorites|favorities)(\\|$)/i.test(lower)) {
    throw new Error(`Destino bloqueado por seguridad: ${myTrainingDirectory}. La app solo puede instalar en Training\\0000000000000000\\MyTraining.`);
  }
  return true;
}

function createTrainingInstallSafetySnapshot(targetMyTrainingDirectory, generatedTemFileName) {
  assertSafeMyTrainingTarget(targetMyTrainingDirectory);
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[^0-9]/g, '').slice(0, 14);
  const backupRoot = path.join(getTrainingSafetyDirectory(), `install-${safeStamp}`);
  const accountRoot = getAccountRootFromMyTrainingDirectory(targetMyTrainingDirectory);
  fs.mkdirSync(backupRoot, { recursive: true });

  const beforeTemFiles = findTemFiles(targetMyTrainingDirectory).map((file) => ({
    path: file,
    fileName: path.basename(file),
    sizeBytes: (() => { try { return fs.statSync(file).size; } catch { return 0; } })(),
  }));

  try {
    copyDirectoryRecursive(targetMyTrainingDirectory, path.join(backupRoot, 'MyTraining_before'));
  } catch (error) {
    fs.writeFileSync(path.join(backupRoot, 'backup-warning.txt'), `No se pudo copiar MyTraining completo: ${error instanceof Error ? error.message : String(error)}`, 'utf8');
  }

  const beforeManifestFiles = [];
  if (accountRoot && directoryExists(accountRoot)) {
    for (const file of fs.readdirSync(accountRoot)) {
      if (!/^RLA_.*_manifest\.json$/i.test(file)) continue;
      const source = path.join(accountRoot, file);
      beforeManifestFiles.push(source);
      try {
        fs.copyFileSync(source, path.join(backupRoot, file));
      } catch { /* best effort */ }
    }
  }

  const snapshot = {
    app: 'RL Performance Lab',
    type: 'training-pack-install-snapshot',
    createdAt,
    backupRoot,
    targetMyTrainingDirectory,
    accountRoot,
    generatedTemFileName,
    beforeTemFiles,
    beforeManifestFiles,
    note: 'Rollback seguro: solo elimina el .Tem/manifiesto instalados por RLA en el último intento. No toca packs manuales.',
  };
  fs.writeFileSync(path.join(backupRoot, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8');
  return snapshot;
}

function writeLastTrainingInstallRecord(record) {
  const payload = {
    app: 'RL Performance Lab',
    type: 'last-training-pack-install-record',
    updatedAt: new Date().toISOString(),
    ...record,
  };
  fs.writeFileSync(getLastTrainingInstallRecordPath(), JSON.stringify(payload, null, 2), 'utf8');
  if (payload.backupRoot) {
    try { fs.writeFileSync(path.join(payload.backupRoot, 'last-install-record.json'), JSON.stringify(payload, null, 2), 'utf8'); } catch { /* ignore */ }
  }
  return payload;
}

function safelyRemoveRlaInstalledPath(filePath, targetMyTrainingDirectory) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  if (!isPathInside(targetMyTrainingDirectory, filePath)) return false;
  if (!/\.tem$/i.test(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

function rollbackLastTrainingPackInstall() {
  const status = getTrainingPackStatus('Rollback de packs RLA listo.');
  const record = readLastTrainingInstallRecord();
  if (!record?.installedTemPath || !record?.targetMyTrainingDirectory) {
    return { ...status, ok: false, message: 'No hay instalación RLA reciente para revertir.' };
  }

  const removed = [];
  const warnings = [];
  try {
    if (safelyRemoveRlaInstalledPath(record.installedTemPath, record.targetMyTrainingDirectory)) removed.push(record.installedTemPath);
  } catch (error) {
    warnings.push(`No se pudo borrar .Tem instalado: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const manifestPath = record.manifestPath || '';
    if (manifestPath && fs.existsSync(manifestPath) && /^RLA_.*_manifest\.json$/i.test(path.basename(manifestPath))) {
      fs.rmSync(manifestPath, { force: true });
      removed.push(manifestPath);
    }
  } catch (error) {
    warnings.push(`No se pudo borrar manifest RLA: ${error instanceof Error ? error.message : String(error)}`);
  }

  const rollbackReport = {
    rolledBackAt: new Date().toISOString(),
    record,
    removed,
    warnings,
    message: removed.length
      ? `Rollback completado: ${removed.length} archivo(s) RLA removidos. Tus packs manuales no fueron tocados.`
      : 'Rollback ejecutado, pero no había archivos RLA instalados para remover.',
  };

  try {
    const reportPath = path.join(record.backupRoot || getTrainingSafetyDirectory(), `rollback-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(rollbackReport, null, 2), 'utf8');
    rollbackReport.reportPath = reportPath;
  } catch { /* ignore */ }

  return {
    ...getTrainingPackStatus(rollbackReport.message),
    ok: warnings.length === 0,
    lastTrainingSafety: readLastTrainingInstallRecord(),
    rollbackReport,
    message: warnings.length ? `${rollbackReport.message} Advertencias: ${warnings.join(' | ')}` : rollbackReport.message,
  };
}

async function openTrainingSafetyBackups() {
  const dir = getTrainingSafetyDirectory();
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
}

function buildGeneratedPackCode(draftFolder) {
  const seed = `${Date.now()}-${path.basename(draftFolder || 'rla')}`.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const padded = `${seed}0000000000000000`.slice(0, 16);
  return `RLA-${padded.slice(0, 4)}-${padded.slice(4, 8)}-${padded.slice(8, 12)}`;
}

function buildGeneratedTemFileName(draftFolder) {
  const seed = `${Date.now()}${path.basename(draftFolder || 'rla')}${Math.random().toString(16).slice(2)}`;
  let hex = Buffer.from(seed).toString('hex').toUpperCase().replace(/[^A-F0-9]/g, '');
  hex = `${hex}00000000000000000000000000000000`.slice(0, 32);
  return `${hex}.Tem`;
}


function safeListDirectories(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name));
  } catch {
    return [];
  }
}

function findTemFiles(directory) {
  const temFiles = [];
  function walk(current, depth = 0) {
    if (!current || depth > 4 || temFiles.length > 80) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tem')) temFiles.push(next);
    }
  }
  walk(directory);
  return temFiles.sort((a, b) => {
    try { return fs.statSync(b).size - fs.statSync(a).size; } catch { return 0; }
  });
}

function getRlaGeneratedTemMarkers() {
  const names = new Set();
  const paths = new Set();

  function rememberTem(filePath) {
    if (!filePath || typeof filePath !== 'string') return;
    names.add(path.basename(filePath).toLowerCase());
    paths.add(path.resolve(filePath).toLowerCase());
  }

  function walk(current, depth = 0) {
    if (!current || depth > 5) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next, depth + 1);
        continue;
      }
      if (!entry.isFile() || !/^RLA_.*_manifest\.json$/i.test(entry.name)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(next, 'utf8'));
        rememberTem(manifest.installedTemPath);
        if (manifest.generatedCode) rememberTem(`${manifest.generatedCode}.Tem`);
      } catch {
        // Si un manifest se corrompe, no bloquear el scan.
      }
    }
  }

  for (const root of findTrainingRoots()) walk(path.join(root, 'Training'), 0);
  return { names, paths };
}

function isRlaGeneratedTem(filePath, markers = getRlaGeneratedTemMarkers()) {
  const normalized = path.resolve(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();
  return markers.paths.has(normalized) || markers.names.has(name);
}


function moveFileOrDirectoryToBackup(sourcePath, backupRoot) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  fs.mkdirSync(backupRoot, { recursive: true });
  const base = path.basename(sourcePath);
  const target = path.join(backupRoot, base);
  let finalTarget = target;
  let index = 1;
  while (fs.existsSync(finalTarget)) {
    finalTarget = path.join(backupRoot, `${base}.${index}`);
    index += 1;
  }
  fs.renameSync(sourcePath, finalTarget);
  return finalTarget;
}

function cleanupGeneratedTrainingPacks() {
  const cleanedAt = new Date().toISOString();
  const backupRoot = path.join(app.getPath('userData'), 'training-pack-backups', cleanedAt.replace(/[^0-9]/g, '').slice(0, 14));
  const markers = getRlaGeneratedTemMarkers();
  const movedTem = [];
  const movedManifests = [];
  const movedDrafts = [];
  const warnings = [];

  // Limpiar .Tem generados por RLA usando manifiestos. No toca packs manuales sin manifest.
  for (const myTrainingDirectory of findMyTrainingDirectories()) {
    for (const temPath of findTemFiles(myTrainingDirectory)) {
      if (!isRlaGeneratedTem(temPath, markers)) continue;
      try {
        const movedTo = moveFileOrDirectoryToBackup(temPath, path.join(backupRoot, 'MyTraining'));
        if (movedTo) movedTem.push({ from: temPath, to: movedTo });
      } catch (error) {
        warnings.push(`No se pudo mover ${temPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Limpiar manifests RLA de la carpeta raíz 0000000000000000.
  for (const root of findTrainingRoots()) {
    const trainingRoot = path.join(root, 'Training');
    for (const profileDirectory of safeListDirectories(trainingRoot)) {
      let files = [];
      try { files = fs.readdirSync(profileDirectory); } catch { files = []; }
      for (const file of files) {
        if (!/^RLA_.*_manifest\.json$/i.test(file)) continue;
        const manifestPath = path.join(profileDirectory, file);
        try {
          const movedTo = moveFileOrDirectoryToBackup(manifestPath, path.join(backupRoot, 'manifests'));
          if (movedTo) movedManifests.push({ from: manifestPath, to: movedTo });
        } catch (error) {
          warnings.push(`No se pudo mover ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  // Limpiar drafts RLA, que no son packs jugables.
  for (const draftFolder of findExistingPackDraftFolders()) {
    try {
      const movedTo = moveFileOrDirectoryToBackup(draftFolder, path.join(backupRoot, 'drafts'));
      if (movedTo) movedDrafts.push({ from: draftFolder, to: movedTo });
    } catch (error) {
      warnings.push(`No se pudo mover ${draftFolder}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const report = { cleanedAt, backupRoot, movedTem, movedManifests, movedDrafts, warnings };
  try {
    fs.mkdirSync(backupRoot, { recursive: true });
    fs.writeFileSync(path.join(backupRoot, 'cleanup-report.json'), JSON.stringify(report, null, 2), 'utf8');
  } catch { /* best effort */ }

  return {
    ...getTrainingPackStatus(),
    ok: true,
    backupRoot,
    movedTemCount: movedTem.length,
    movedDraftCount: movedDrafts.length,
    message: movedTem.length || movedDrafts.length
      ? `Limpieza segura completada: ${movedTem.length} .Tem generado(s) por RLA y ${movedDrafts.length} draft(s) movidos a backup. No se tocaron packs manuales sin manifest.`
      : 'No se encontraron packs RLA con manifest para limpiar. Si ves ROOKIE 0/0 sin manifest, borrá ese pack desde Rocket League o dejá solo tu .Tem bueno manualmente.',
  };
}

function rankTemplateTem(filePath, markers = getRlaGeneratedTemMarkers()) {
  let score = 0;
  const lower = filePath.toLowerCase();
  let stat = null;
  try { stat = fs.statSync(filePath); } catch { return -100000; }
  const size = stat.size || 0;

  // Packs 0/0 suelen ser muy pequeños o generados por RLA. No usarlos como plantilla.
  if (isRlaGeneratedTem(filePath, markers)) score -= 500000;
  if (size < 1500) score -= 200000;
  if (size > 1500) score += Math.min(120000, size);

  // Para tu instalación, el pack creado a mano real vive en MyTraining y los generados por la app tienen manifest.
  if (lower.includes(`${path.sep}mytraining${path.sep}`.toLowerCase())) score += 90000;
  if (lower.includes(`${path.sep}downloaded${path.sep}`.toLowerCase())) score += 30000;
  if (lower.includes(`${path.sep}favorites${path.sep}`.toLowerCase()) || lower.includes(`${path.sep}favorities${path.sep}`.toLowerCase())) score += 20000;

  // Preferir plantillas antiguas/manuales sobre packs recién generados por RLA.
  const ageHours = Math.max(0, (Date.now() - stat.mtimeMs) / 36e5);
  score += Math.min(70000, ageHours * 60);
  return score;
}

function getTrainingPackStatus(message = 'RLA training pack bridge listo.') {
  const rlaLandingDirectory = resolveRlaTrainingPackLandingDirectory();
  const rocketTrainingRoot = resolveRocketTrainingRoot();
  const myTrainingDirectories = findMyTrainingDirectories();
  const draftFolders = findExistingPackDraftFolders();
  const templates = findTrainingPackTemplateDirectories();
  const config = readDesktopConfig();
  const selectedMyTrainingDirectory = config.selectedMyTrainingDirectory || '';
  const selectedTrainingTemplateDirectory = config.selectedTrainingTemplateDirectory || '';
  const rocketRp = getRocketRpTrainingCliStatus();
  const targetMyTrainingDirectory = myTrainingDirectories[0] ?? '';
  const activeTemplate = templates[0] ?? null;
  const exactTemWriterReady = Boolean(rocketRp.isAvailable && targetMyTrainingDirectory && activeTemplate?.templateDirectory);
  const lastTrainingSafety = readLastTrainingInstallRecord();
  return {
    ok: true,
    message: rocketRp.isAvailable
      ? `${message} MyTraining destino: ${targetMyTrainingDirectory ? 'OK' : 'no encontrado'}. Plantillas detectadas: ${templates.length}. Writer seguro: ${exactTemWriterReady ? 'listo para validar' : 'pendiente'}.`
      : 'Rutas de Rocket League detectadas automáticamente. Falta RocketRP.TrainingCLI completo para serializar .Tem reales. Copiá toda la carpeta publish/release, no solo el .exe.',
    rlaLandingDirectory,
    rocketTrainingRoot,
    selectedMyTrainingDirectory,
    selectedTrainingTemplateDirectory,
    targetMyTrainingDirectory,
    myTrainingDirectories,
    draftFolders,
    latestDraftFolder: draftFolders[0] ?? '',
    draftCount: draftFolders.length,
    templates,
    templateAvailable: templates.length > 0,
    activeTemplate,
    rocketRpTrainingCliAvailable: rocketRp.isAvailable,
    rocketRpTrainingCliPath: rocketRp.executablePath,
    rocketRpTrainingCliBundledPath: rocketRp.bundledPath,
    rocketRpTrainingCliSource: rocketRp.source,
    exactTemWriterReady,
    lastTrainingSafety,
    canRollbackLastInstall: Boolean(lastTrainingSafety?.installedTemPath),
    safetyMode: 'rla_only_with_rollback',
    exactTemWriterBlockReason: exactTemWriterReady
      ? 'Adaptive Shot Writer activo: decodifica plantilla, intenta parchear shots con candidatos live/replay, serializa, relee y bloquea si shots === 0. Si el schema no es parcheable, cae a modo seguro sin tocar tus packs manuales.'
      : 'Adaptive Shot Writer no está listo: falta RocketRP completo, carpeta MyTraining destino o plantilla .Tem válida.',
    packWorkflowStage: exactTemWriterReady ? 'tem_writer_validation' : 'capture_and_seed_only',
  };
}

async function selectMyTrainingDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta MyTraining de Rocket League',
    properties: ['openDirectory'],
    defaultPath: resolveDefaultMyTrainingDirectory(),
  });

  if (result.canceled || !result.filePaths[0]) return getTrainingPackStatus('Selección cancelada.');
  const selected = result.filePaths[0];
  writeDesktopConfig({ selectedMyTrainingDirectory: selected });
  return getTrainingPackStatus('Carpeta MyTraining seleccionada manualmente.');
}

async function selectTrainingTemplateDirectory() {
  // Windows treats mixed openFile + openDirectory dialogs like a folder picker in some shells,
  // which hides .Tem files. Keep this action as a strict file picker.
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar archivo .Tem plantilla',
    properties: ['openFile'],
    filters: [
      { name: 'Rocket League Training Pack (.Tem)', extensions: ['Tem', 'tem'] },
      { name: 'Todos', extensions: ['*'] },
    ],
    defaultPath: resolveDefaultMyTrainingDirectory(),
  });

  if (result.canceled || !result.filePaths[0]) return getTrainingPackStatus('Selección cancelada.');
  const selected = result.filePaths[0];

  try {
    const stat = fs.statSync(selected);
    if (!stat.isFile() || path.extname(selected).toLowerCase() !== '.tem') {
      return getTrainingPackStatus('Selección inválida: elegí un archivo .Tem, no una carpeta.');
    }
  } catch {
    return getTrainingPackStatus('Selección inválida: no se pudo leer el archivo .Tem.');
  }

  writeDesktopConfig({ selectedTrainingTemplateDirectory: selected });
  return getTrainingPackStatus(`Plantilla .Tem seleccionada: ${path.basename(selected)}.`);
}

async function selectRocketRpTrainingCliExecutable() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar RocketRP.TrainingCLI.exe',
    properties: ['openFile'],
    filters: [{ name: 'RocketRP Training CLI', extensions: ['exe'] }, { name: 'Todos', extensions: ['*'] }],
  });

  if (result.canceled || !result.filePaths[0]) return getTrainingPackStatus('Selección cancelada.');
  configuredRocketRpTrainingCliPath = result.filePaths[0];
  writeDesktopConfig({ rocketRpTrainingCliPath: configuredRocketRpTrainingCliPath });
  return getTrainingPackStatus('RocketRP TrainingCLI seleccionado. Ya se puede intentar serializar .Tem real desde una plantilla.');
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ ok: false, code: -1, stdout, stderr: `${stderr}
${error.message}` }));
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

function listFilesByExtension(directory, extension) {
  const results = [];
  function walk(current, depth = 0) {
    if (!current || depth > 4 || results.length > 50) return;
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) walk(next, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension.toLowerCase())) results.push(next);
    }
  }
  walk(directory);
  return results.sort((a, b) => {
    try {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      if (statB.size !== statA.size) return statB.size - statA.size;
      return statB.mtimeMs - statA.mtimeMs;
    } catch { return 0; }
  });
}

function patchTrainingJsonMetadata(value, draft, generatedCode) {
  const title = String(draft?.title || `RLA Pack ${generatedCode.slice(0, 8)}`).slice(0, 42);
  const description = `RL Performance Lab · ${draft?.shots?.length || 0} tiros candidatos · ${new Date().toLocaleDateString()}`.slice(0, 120);

  const titleKeys = new Set(['title', 'name', 'trainingname', 'trainingtitle', 'packname', 'sequencename']);
  const descriptionKeys = new Set(['description', 'desc', 'packdescription', 'trainingdescription']);
  const tagKeys = new Set(['tag', 'tags', 'category']);

  const visit = (node, key = '', depth = 0) => {
    if (Array.isArray(node)) return node.map((item) => visit(item, key, depth + 1));
    if (node && typeof node === 'object') {
      const output = {};
      for (const [childKey, childValue] of Object.entries(node)) output[childKey] = visit(childValue, childKey, depth + 1);
      return output;
    }

    if (typeof node !== 'string') return node;
    const lower = String(key || '').toLowerCase();
    if (titleKeys.has(lower) && node.trim().length <= 64) return title;
    if (descriptionKeys.has(lower) && node.trim().length <= 240) return description;
    if (tagKeys.has(lower) && node.trim().length <= 48) return 'Offence';
    if (depth <= 5 && /^speedflip|^sddasdas|rookie$/i.test(node.trim())) return title;
    return node;
  };

  return visit(value);
}

function patchTrainingJsonForLocalRlaPack(value, draft, generatedCode) {
  return patchTrainingJsonMetadata(value, draft, generatedCode);
}

function countLikelyTrainingShots(value) {
  let best = 0;

  const scalarKeys = new Set([
    'shotcount',
    'shotscount',
    'numshots',
    'roundcount',
    'sequencecount',
    'trainingshotcount',
  ]);

  const objectLooksLikeShot = (item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const keys = Object.keys(item).map((key) => key.toLowerCase());
    const joined = keys.join(' ');
    const hasBall = /ball/.test(joined);
    const hasPlayer = /(car|player|spawn|start)/.test(joined);
    const hasTransform = /(location|position|rotation|velocity|x|y|z|pitch|yaw|roll)/.test(joined);
    const hasTrainingWords = /(shot|round|sequence|training|attempt|difficulty|time)/.test(joined);
    return (hasBall && hasTransform) || (hasPlayer && hasTransform && hasTrainingWords);
  };

  const visit = (node, key = '', depth = 0) => {
    if (node === null || node === undefined || depth > 18) return;

    const lowerKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (typeof node === 'number' && scalarKeys.has(lowerKey) && Number.isFinite(node)) {
      best = Math.max(best, Math.max(0, Math.floor(node)));
      return;
    }

    if (Array.isArray(node)) {
      const rawKey = String(key || '').toLowerCase();
      const namedLikeShotArray = /(shot|round|sequence|training|challenge|attempt)/i.test(rawKey);
      const objectShotCount = node.filter(objectLooksLikeShot).length;
      if (namedLikeShotArray && node.some((item) => item && typeof item === 'object')) {
        best = Math.max(best, node.length);
      }
      if (objectShotCount) best = Math.max(best, objectShotCount);
      for (const item of node) visit(item, key, depth + 1);
      return;
    }

    if (typeof node === 'object') {
      for (const [childKey, childValue] of Object.entries(node)) visit(childValue, childKey, depth + 1);
    }
  };

  visit(value);
  return best;
}

function deepCloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function parseVectorFromText(text = '') {
  const match = String(text).match(/Impacto\s*\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/i)
    || String(text).match(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
  if (!match) return null;
  const vector = { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
  return [vector.x, vector.y, vector.z].every(Number.isFinite) ? vector : null;
}

function normalizeVector(input) {
  if (!input || typeof input !== 'object') return null;
  const x = Number(input.x ?? input.X);
  const y = Number(input.y ?? input.Y);
  const z = Number(input.z ?? input.Z);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function vectorToTemplateCase(source, vector) {
  const upper = Object.prototype.hasOwnProperty.call(source, 'X') || Object.prototype.hasOwnProperty.call(source, 'Y') || Object.prototype.hasOwnProperty.call(source, 'Z');
  if (upper) return { ...source, X: vector.x, Y: vector.y, Z: vector.z };
  return { ...source, x: vector.x, y: vector.y, z: vector.z };
}

function getCandidateVector(candidate) {
  return normalizeVector(candidate?.shotTelemetry?.impactLocation)
    || normalizeVector(candidate?.shotTelemetry?.ballLocation)
    || parseVectorFromText(candidate?.reason)
    || null;
}

function candidateToTrainingShotSpec(candidate, index) {
  const rawImpact = getCandidateVector(candidate);
  const teamNum = Number(candidate?.shotTelemetry?.playerTeamNum);
  const blueAttackingOrange = Number.isFinite(teamNum) ? teamNum === 0 : index % 2 === 0;
  const attackDirection = blueAttackingOrange ? 1 : -1;
  const defaultY = attackDirection > 0 ? 3200 : -3200;
  const defaultX = ((index % 5) - 2) * 520;
  const impact = rawImpact
    ? { x: clampNumber(rawImpact.x, -3600, 3600), y: clampNumber(rawImpact.y, -4700, 4700), z: clampNumber(rawImpact.z || 92, 92, 1700) }
    : { x: defaultX, y: defaultY, z: 120 + (index % 3) * 40 };
  const target = { x: 0, y: attackDirection > 0 ? 5120 : -5120, z: 260 };
  const dx = target.x - impact.x;
  const dy = target.y - impact.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const carDistance = 1150 + (index % 3) * 180;
  const car = {
    x: clampNumber(impact.x - (dx / length) * carDistance + (((index % 2) ? 1 : -1) * 120), -3900, 3900),
    y: clampNumber(impact.y - (dy / length) * carDistance, -5000, 5000),
    z: 18,
  };
  const speed = clampNumber(candidate?.shotTelemetry?.postHitSpeed || candidate?.shotTelemetry?.goalSpeed || (850 + (100 - Number(candidate?.shotScore || 50)) * 5), 650, 1900);
  const velocity = {
    x: Math.round((dx / length) * speed),
    y: Math.round((dy / length) * speed),
    z: Math.round(260 + Math.max(0, 62 - Number(candidate?.shotScore || 50)) * 6),
  };
  const yawRadians = Math.atan2(dy, dx);
  const yawUnreal = Math.round((yawRadians / (Math.PI * 2)) * 65536);
  return {
    index,
    id: candidate?.id || `shot-${index + 1}`,
    source: candidate?.replayFileName || candidate?.matchLabel || 'RLA candidate',
    reason: candidate?.reason || 'Candidato RLA',
    score: Number(candidate?.shotScore || 50),
    attackDirection,
    ball: impact,
    car,
    target,
    ballVelocity: velocity,
    carVelocity: { x: Math.round((dx / length) * 950), y: Math.round((dy / length) * 950), z: 0 },
    carRotation: { pitch: 0, yaw: yawUnreal, roll: 0 },
  };
}

function getTrainingShotSpecsFromDraft(draft, templateShotCount) {
  const candidates = Array.isArray(draft?.shots) ? draft.shots : [];
  if (!candidates.length) return [];
  // Seguridad: no expandir más allá del número de tiros que la plantilla ya sabe cargar.
  // Si querés 15 tiros personalizados, creá una plantilla manual con 15 tiros dummy.
  const limit = Math.max(1, Math.min(candidates.length, templateShotCount || candidates.length, 15));
  return candidates.slice(0, limit).map(candidateToTrainingShotSpec);
}

function vectorKeyType(pathString) {
  const lower = String(pathString || '').toLowerCase();
  if (/velocity|vel|speed/.test(lower)) return 'velocity';
  if (/rotation|rotator|orientation|pitch|yaw|roll/.test(lower)) return 'rotation';
  if (/target|goal|aim/.test(lower)) return 'target';
  if (/ball/.test(lower)) return 'ball';
  if (/car|player|spawn|start|vehicle/.test(lower)) return 'car';
  return 'unknown';
}

function patchVectorObject(node, pathString, spec, counters) {
  const vector = normalizeVector(node);
  if (!vector) return node;
  const type = vectorKeyType(pathString);
  let replacement = null;
  if (type === 'ball') replacement = spec.ball;
  else if (type === 'car') replacement = spec.car;
  else if (type === 'target') replacement = spec.target;
  else if (type === 'velocity') replacement = /ball/i.test(pathString) ? spec.ballVelocity : spec.carVelocity;

  if (!replacement) return node;
  counters[type] = (counters[type] || 0) + 1;
  return vectorToTemplateCase(node, replacement);
}

function patchRotationObject(node, pathString, spec, counters) {
  if (!isPlainObject(node)) return node;
  const keys = Object.keys(node);
  const normalized = keys.map((key) => key.toLowerCase());
  const hasRotation = normalized.some((key) => ['pitch', 'yaw', 'roll'].includes(key));
  if (!hasRotation || !/car|player|spawn|start|rotation|rotator|orientation/i.test(pathString)) return node;
  const output = { ...node };
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower === 'pitch') output[key] = spec.carRotation.pitch;
    if (lower === 'yaw') output[key] = spec.carRotation.yaw;
    if (lower === 'roll') output[key] = spec.carRotation.roll;
  }
  counters.rotation = (counters.rotation || 0) + 1;
  return output;
}

function patchShotObjectGeometry(templateShot, spec) {
  const counters = {};
  const visit = (node, pathParts = [], depth = 0) => {
    if (node === null || node === undefined || depth > 18) return node;
    if (Array.isArray(node)) return node.map((item, index) => visit(item, [...pathParts, `[${index}]`], depth + 1));
    if (!isPlainObject(node)) return node;

    const pathString = pathParts.join('.');
    const rotated = patchRotationObject(node, pathString, spec, counters);
    const vectored = patchVectorObject(rotated, pathString, spec, counters);
    if (vectored !== rotated) return vectored;

    const output = {};
    for (const [key, value] of Object.entries(rotated)) {
      output[key] = visit(value, [...pathParts, key], depth + 1);
    }
    return output;
  };
  const patched = visit(templateShot, ['shot'], 0);
  return { shot: patched, counters };
}

function objectLooksLikeTrainingShotForPatch(item) {
  if (!isPlainObject(item)) return false;
  const keys = Object.keys(item).map((key) => key.toLowerCase()).join(' ');
  const hasBall = /ball/.test(keys);
  const hasCar = /(car|player|spawn|start|vehicle)/.test(keys);
  const hasTransform = /(location|position|rotation|velocity|x|y|z|pitch|yaw|roll)/.test(keys);
  const hasTraining = /(shot|round|sequence|training|attempt|difficulty|time|name)/.test(keys);
  return (hasBall && hasTransform) || (hasCar && hasTransform && hasTraining);
}

function findTrainingShotArrays(root) {
  const arrays = [];
  const visit = (node, pathParts = [], parent = null, key = '', depth = 0) => {
    if (!node || depth > 16) return;
    if (Array.isArray(node)) {
      const objectItems = node.filter(isPlainObject);
      const shotLikeCount = objectItems.filter(objectLooksLikeTrainingShotForPatch).length;
      const keyPath = [...pathParts, key].join('.').toLowerCase();
      const namedLikeShots = /(shot|round|sequence|training|challenge|attempt)/i.test(keyPath);
      if (node.length && objectItems.length && (shotLikeCount || namedLikeShots)) {
        arrays.push({ parent, key, path: [...pathParts, key].filter(Boolean).join('.'), array: node, score: shotLikeCount * 20 + (namedLikeShots ? 10 : 0) + Math.min(node.length, 15) });
      }
      node.forEach((item, index) => visit(item, [...pathParts, key, `[${index}]`], node, index, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    for (const [childKey, childValue] of Object.entries(node)) visit(childValue, pathParts, node, childKey, depth + 1);
  };
  visit(root, [], null, '', 0);
  return arrays.sort((a, b) => b.score - a.score);
}

function setLikelyShotCountScalars(root, count) {
  const keys = new Set(['shotcount', 'shotscount', 'numshots', 'roundcount', 'sequencecount', 'trainingshotcount']);
  let updates = 0;
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 18) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (typeof value === 'number' && keys.has(lower)) {
        node[key] = count;
        updates += 1;
      } else {
        visit(value, depth + 1);
      }
    }
  };
  visit(root);
  return updates;
}

function patchTrainingJsonShotGeometry(value, draft, generatedCode, templateShotCount) {
  const patched = patchTrainingJsonMetadata(value, draft, generatedCode);
  const specs = getTrainingShotSpecsFromDraft(draft, templateShotCount);
  const report = {
    mode: 'adaptive-shot-geometry-v1',
    requestedCandidates: Array.isArray(draft?.shots) ? draft.shots.length : 0,
    patchedShotCount: 0,
    templateShotCount,
    selectedArrayPath: '',
    counters: {},
    scalarCountFieldsUpdated: 0,
    notes: [],
    specs: specs.map((spec) => ({ id: spec.id, ball: spec.ball, car: spec.car, target: spec.target, ballVelocity: spec.ballVelocity, source: spec.source, reason: spec.reason })),
  };

  if (!specs.length) {
    report.notes.push('No hay candidatos con telemetría/seed para parchear geometría; solo metadata.');
    return { json: patched, report };
  }

  const arrays = findTrainingShotArrays(patched);
  const target = arrays[0];
  if (!target?.parent || target.key === '') {
    report.notes.push('No se encontró un array de shots confiable en el JSON RocketRP. Se conserva plantilla.');
    return { json: patched, report };
  }

  const templateArray = target.array.filter(isPlainObject);
  if (!templateArray.length) {
    report.notes.push(`Array candidato ${target.path} existe, pero no tiene objetos clonables.`);
    return { json: patched, report };
  }

  const nextArray = specs.map((spec, index) => {
    const sourceShot = templateArray[index % templateArray.length];
    const { shot, counters } = patchShotObjectGeometry(deepCloneJson(sourceShot), spec);
    for (const [key, value] of Object.entries(counters)) report.counters[key] = (report.counters[key] || 0) + value;
    return shot;
  });

  // Mantener cualquier item no-objeto de la plantilla solo si existía antes de los shots; no duplicar basura al final.
  target.parent[target.key] = nextArray;
  report.patchedShotCount = nextArray.length;
  report.selectedArrayPath = target.path;
  report.scalarCountFieldsUpdated = setLikelyShotCountScalars(patched, nextArray.length);
  if (!Object.values(report.counters).some(Boolean)) {
    report.notes.push('Se clonaron shots pero no se detectaron vectores X/Y/Z o rotaciones parcheables. El .Tem se validará antes de instalar.');
  }
  return { json: patched, report };
}


function setVectorInPlacePreservingCase(node, vector) {
  if (!isPlainObject(node) || !vector) return false;
  const hasUpper = Object.prototype.hasOwnProperty.call(node, 'X') || Object.prototype.hasOwnProperty.call(node, 'Y') || Object.prototype.hasOwnProperty.call(node, 'Z');
  if (hasUpper) {
    if (Object.prototype.hasOwnProperty.call(node, 'X')) node.X = vector.x;
    if (Object.prototype.hasOwnProperty.call(node, 'Y')) node.Y = vector.y;
    if (Object.prototype.hasOwnProperty.call(node, 'Z')) node.Z = vector.z;
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'x')) node.x = vector.x;
  if (Object.prototype.hasOwnProperty.call(node, 'y')) node.y = vector.y;
  if (Object.prototype.hasOwnProperty.call(node, 'z')) node.z = vector.z;
  return true;
}

function mutateFirstVectorInShot(shot, spec, matcher, replacement, label, report) {
  const visit = (node, pathParts = [], depth = 0) => {
    if (node === null || node === undefined || depth > 18) return false;
    const pathString = pathParts.join('.').toLowerCase();

    if (isPlainObject(node) && normalizeVector(node) && matcher(pathString, node)) {
      setVectorInPlacePreservingCase(node, replacement);
      report.counters[label] = (report.counters[label] || 0) + 1;
      report.changedPaths.push({ label, path: pathParts.join('.'), replacement });
      return true;
    }

    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        if (visit(node[index], [...pathParts, `[${index}]`], depth + 1)) return true;
      }
      return false;
    }

    if (isPlainObject(node)) {
      for (const [key, childValue] of Object.entries(node)) {
        if (visit(childValue, [...pathParts, key], depth + 1)) return true;
      }
    }
    return false;
  };
  return visit(shot, ['shot'], 0);
}


function collectShotSchemaNumberLeaves(root, maxDepth = 22) {
  const leaves = [];
  const visit = (node, pathParts = [], depth = 0) => {
    if (node === null || node === undefined || depth > maxDepth || leaves.length > 1200) return;
    if (typeof node === 'number' && Number.isFinite(node)) {
      const pathString = pathParts.join('.');
      const lower = pathString.toLowerCase();
      const score =
        (/ball/.test(lower) ? 100 : 0) +
        (/(car|player|vehicle)/.test(lower) ? 90 : 0) +
        (/(location|position|translation|spawn|start|loc)/.test(lower) ? 70 : 0) +
        (/(velocity|speed|linear)/.test(lower) ? 55 : 0) +
        (/(rotation|rotator|pitch|yaw|roll|orientation)/.test(lower) ? 45 : 0) +
        (/(x|y|z)$/i.test(pathString) ? 20 : 0);
      leaves.push({ path: pathString, value: node, score });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...pathParts, `[${index}]`], depth + 1));
      return;
    }
    if (isPlainObject(node)) {
      for (const [key, value] of Object.entries(node)) visit(value, [...pathParts, key], depth + 1);
    }
  };
  visit(root, ['shot'], 0);
  return leaves.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function collectShotSchemaVectorCandidates(root, maxDepth = 22) {
  const vectors = [];
  const visit = (node, pathParts = [], depth = 0) => {
    if (node === null || node === undefined || depth > maxDepth || vectors.length > 800) return;
    const pathString = pathParts.join('.');
    const lower = pathString.toLowerCase();
    if (isPlainObject(node)) {
      const vector = normalizeVector(node);
      if (vector) {
        const keyScore =
          (/ball/.test(lower) ? 120 : 0) +
          (/(car|player|vehicle)/.test(lower) ? 105 : 0) +
          (/(location|position|translation|spawn|start|loc)/.test(lower) ? 90 : 0) +
          (/(velocity|speed|linear)/.test(lower) ? 70 : 0) +
          (/(target|goal|net|aim)/.test(lower) ? 55 : 0) +
          (/(rotation|rotator|orientation)/.test(lower) ? 30 : 0);
        vectors.push({
          path: pathString,
          lowerPath: lower,
          vector,
          keys: Object.keys(node),
          suggestedRole: vectorKeyType(pathString),
          score: keyScore,
        });
      }
      for (const [key, value] of Object.entries(node)) visit(value, [...pathParts, key], depth + 1);
      return;
    }
    if (Array.isArray(node)) node.forEach((item, index) => visit(item, [...pathParts, `[${index}]`], depth + 1));
  };
  visit(root, ['shot'], 0);
  return vectors.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function indexNumberLeavesByPath(root) {
  const index = new Map();
  for (const item of collectShotSchemaNumberLeaves(root, 24)) index.set(item.path, item.value);
  return index;
}

function compareShotNumericLeaves(a, b) {
  if (!a || !b) return [];
  const aIndex = indexNumberLeavesByPath(a);
  const bIndex = indexNumberLeavesByPath(b);
  const diffs = [];
  for (const [pathString, aValue] of aIndex.entries()) {
    if (!bIndex.has(pathString)) continue;
    const bValue = bIndex.get(pathString);
    if (aValue !== bValue) {
      const lower = pathString.toLowerCase();
      const score =
        (/ball/.test(lower) ? 100 : 0) +
        (/(car|player|vehicle)/.test(lower) ? 90 : 0) +
        (/(location|position|translation|spawn|start|loc)/.test(lower) ? 70 : 0) +
        (/(velocity|speed)/.test(lower) ? 55 : 0) +
        (/(rotation|pitch|yaw|roll)/.test(lower) ? 45 : 0);
      diffs.push({ path: pathString, shot1: aValue, shot2: bValue, delta: Number((bValue - aValue).toFixed(6)), score });
    }
  }
  return diffs.sort((x, y) => y.score - x.score || Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 300);
}

function summarizeShotShape(node, depth = 0, maxDepth = 4) {
  if (node === null || node === undefined) return typeof node;
  if (Array.isArray(node)) return { type: 'array', length: node.length, sample: node.length ? summarizeShotShape(node[0], depth + 1, maxDepth) : null };
  if (!isPlainObject(node)) return typeof node;
  if (depth >= maxDepth) return { type: 'object', keys: Object.keys(node).slice(0, 25), truncated: true };
  const out = {};
  for (const [key, value] of Object.entries(node).slice(0, 30)) out[key] = summarizeShotShape(value, depth + 1, maxDepth);
  return out;
}


function safeHashText(value) {
  try { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); } catch { return ''; }
}

function printableRatio(value) {
  const text = String(value ?? '');
  if (!text.length) return 0;
  let printable = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) printable += 1;
  }
  return Number((printable / text.length).toFixed(4));
}

function commonPrefixLength(a, b) {
  const max = Math.min(String(a).length, String(b).length);
  for (let i = 0; i < max; i += 1) if (String(a)[i] !== String(b)[i]) return i;
  return max;
}

function commonSuffixLength(a, b) {
  const left = String(a);
  const right = String(b);
  const max = Math.min(left.length, right.length);
  for (let i = 0; i < max; i += 1) if (left[left.length - 1 - i] !== right[right.length - 1 - i]) return i;
  return max;
}

function detectStringEncodingHints(value) {
  const text = String(value ?? '');
  const trimmed = text.trim();
  const hints = [];
  if (!text.length) hints.push('empty');
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length % 4 === 0 && trimmed.length > 24) hints.push('base64-like');
  if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed) && trimmed.length > 24) hints.push('hex-like');
  if (/^\s*[\[{]/.test(text)) hints.push('json-like');
  if (/Class|Archetype|Ball|Car|Player|Training|TAGame|GameEvent|PRI|Vehicle/i.test(text)) hints.push('rocket-text-keywords');
  if (text.includes('\\u0000') || text.includes('\u0000')) hints.push('contains-null-escape');
  if (printableRatio(text) > 0.92) hints.push('mostly-printable');
  return hints;
}

function tryDecodeBase64Preview(value) {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(text) || text.length % 4 !== 0 || text.length < 24) return null;
  try {
    const buffer = Buffer.from(text, 'base64');
    if (!buffer.length) return null;
    const asUtf8 = buffer.toString('utf8');
    return {
      byteLength: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      printableRatio: printableRatio(asUtf8),
      utf8Start: asUtf8.slice(0, 160),
      utf8End: asUtf8.slice(-160),
      hexStart: buffer.subarray(0, 96).toString('hex'),
    };
  } catch {
    return null;
  }
}

function summarizeSerializedArchetypeString(value) {
  const text = String(value ?? '');
  return {
    type: typeof value,
    length: text.length,
    sha256: safeHashText(text),
    printableRatio: printableRatio(text),
    hints: detectStringEncodingHints(text),
    start: text.slice(0, 180),
    end: text.slice(-180),
    base64Preview: tryDecodeBase64Preview(text),
  };
}

function buildSerializedArchetypesMap(rounds, specs) {
  const out = {
    mode: 'phase43-serialized-archetypes-mapper-v1',
    createdAt: new Date().toISOString(),
    ok: false,
    roundCount: Array.isArray(rounds) ? rounds.length : 0,
    plannedSpecs: specs.map((spec, index) => ({ slot: index + 1, id: spec.id, ball: spec.ball, car: spec.car, target: spec.target, ballVelocity: spec.ballVelocity, source: spec.source, reason: spec.reason })),
    topLevelKeysByRound: [],
    serializedArchetypesByRound: [],
    diffsShot1VsShot2: [],
    fieldConclusions: [],
    notes: [
      'Phase 43 no muta el .Tem. Solo inspecciona SerializedArchetypes porque RocketRP expone cada round como TimeLimit + SerializedArchetypes.',
      'Si SerializedArchetypes contiene strings opacos, no se deben editar a mano hasta tener un decoder o un diff controlado.',
    ],
  };

  if (!Array.isArray(rounds) || !rounds.length) {
    out.notes.push('No hay rounds para analizar.');
    return out;
  }

  out.ok = true;
  out.topLevelKeysByRound = rounds.slice(0, 15).map((round, index) => ({ slot: index + 1, keys: isPlainObject(round) ? Object.keys(round) : [], timeLimit: isPlainObject(round) ? round.TimeLimit : null }));

  out.serializedArchetypesByRound = rounds.slice(0, 15).map((round, index) => {
    const serialized = isPlainObject(round) && Array.isArray(round.SerializedArchetypes) ? round.SerializedArchetypes : [];
    return {
      slot: index + 1,
      count: serialized.length,
      archetypes: serialized.map((item, archetypeIndex) => ({ archetypeIndex, ...summarizeSerializedArchetypeString(item) })),
    };
  });

  const shot1 = out.serializedArchetypesByRound[0]?.archetypes || [];
  const shot2 = out.serializedArchetypesByRound[1]?.archetypes || [];
  const count = Math.max(shot1.length, shot2.length);
  for (let i = 0; i < count; i += 1) {
    const a = String((isPlainObject(rounds[0]) && Array.isArray(rounds[0].SerializedArchetypes) ? rounds[0].SerializedArchetypes[i] : '') ?? '');
    const b = String((isPlainObject(rounds[1]) && Array.isArray(rounds[1].SerializedArchetypes) ? rounds[1].SerializedArchetypes[i] : '') ?? '');
    const prefix = commonPrefixLength(a, b);
    const suffix = commonSuffixLength(a, b);
    out.diffsShot1VsShot2.push({
      archetypeIndex: i,
      equal: a === b,
      length1: a.length,
      length2: b.length,
      lengthDelta: b.length - a.length,
      sha256Shot1: safeHashText(a),
      sha256Shot2: safeHashText(b),
      commonPrefixLength: prefix,
      commonSuffixLength: suffix,
      firstDiffIndex: a === b ? -1 : prefix,
      shot1AroundDiff: a === b ? '' : a.slice(Math.max(0, prefix - 90), Math.min(a.length, prefix + 180)),
      shot2AroundDiff: a === b ? '' : b.slice(Math.max(0, prefix - 90), Math.min(b.length, prefix + 180)),
    });
  }

  const allArchetypes = out.serializedArchetypesByRound.flatMap((round) => round.archetypes);
  const base64Count = allArchetypes.filter((item) => item.hints.includes('base64-like')).length;
  const keywordCount = allArchetypes.filter((item) => item.hints.includes('rocket-text-keywords')).length;
  const mostlyPrintableCount = allArchetypes.filter((item) => item.hints.includes('mostly-printable')).length;
  out.fieldConclusions.push(`SerializedArchetypes total analizados: ${allArchetypes.length}. base64-like=${base64Count}, rocket-keywords=${keywordCount}, mostly-printable=${mostlyPrintableCount}.`);
  if (out.diffsShot1VsShot2.every((diff) => diff.equal)) out.fieldConclusions.push('Shot #1 y #2 tienen SerializedArchetypes idénticos; tus tiros dummy podrían ser clones iguales o la geometría está fuera de esos strings.');
  else out.fieldConclusions.push('Hay diferencias entre SerializedArchetypes de shot #1 y #2. Revisar diffsShot1VsShot2 para encontrar dónde cambia la geometría.');
  out.notes.push('Siguiente paso seguro: si hay diferencias claras entre shots dummy, crear Phase 44 que cambie solo un valor/segmento confirmado o que haga un experimento controlado de bytes.');
  return out;
}

function buildTrainingShotSchemaMap(value, draft, templateShotCount) {
  const arrays = findTrainingShotArrays(value);
  const target = arrays[0];
  const specs = getTrainingShotSpecsFromDraft(draft, templateShotCount).slice(0, 3);
  const report = {
    mode: 'phase45-same-length-ball-archetype-v1',
    createdAt: new Date().toISOString(),
    ok: false,
    templateShotCount,
    requestedCandidates: Array.isArray(draft?.shots) ? draft.shots.length : 0,
    selectedArrayPath: target?.path || '',
    selectedArrayLength: Array.isArray(target?.array) ? target.array.length : 0,
    selectedArrayCandidates: arrays.slice(0, 8).map((entry) => ({ path: entry.path, length: Array.isArray(entry.array) ? entry.array.length : 0, score: entry.score })),
    plannedSpecs: specs.map((spec, index) => ({ slot: index + 1, id: spec.id, ball: spec.ball, car: spec.car, target: spec.target, ballVelocity: spec.ballVelocity, source: spec.source, reason: spec.reason })),
    vectorCandidates: [],
    highConfidenceBallVectors: [],
    highConfidenceCarVectors: [],
    numericCandidates: [],
    numericDiffsShot1VsShot2: [],
    firstShotShape: null,
    firstShotTopKeys: [],
    serializedArchetypesMap: null,
    notes: [
      'Phase 42 no instala geometría nueva. Solo mapea el schema real del shot para decidir qué rutas mutar en Phase 43.',
      'Si vectorCandidates está vacío, RocketRP representa los tiros con estructura no-vectorial o empaquetada; se necesita comparar JSON completo o bytes.',
    ],
  };

  if (!target || !Array.isArray(target.array) || !isPlainObject(target.array[0])) {
    report.notes.push('No se encontró un array de shots confiable para mapear. Revisar selectedArrayCandidates y template-probe JSON.');
    return report;
  }

  const firstShot = target.array[0];
  const secondShot = target.array.find((item, index) => index > 0 && isPlainObject(item));
  report.serializedArchetypesMap = buildSerializedArchetypesMap(target.array, specs);
  const vectors = collectShotSchemaVectorCandidates(firstShot);
  const numbers = collectShotSchemaNumberLeaves(firstShot);
  report.ok = true;
  report.firstShotTopKeys = Object.keys(firstShot).slice(0, 60);
  report.firstShotShape = summarizeShotShape(firstShot);
  report.vectorCandidates = vectors.slice(0, 250).map(({ path, vector, keys, suggestedRole, score }) => ({ path, vector, keys, suggestedRole, score }));
  report.highConfidenceBallVectors = vectors.filter((item) => /ball/.test(item.lowerPath) && /(location|position|translation|spawn|start|loc)/.test(item.lowerPath)).slice(0, 30).map(({ path, vector, score }) => ({ path, vector, score }));
  report.highConfidenceCarVectors = vectors.filter((item) => /(car|player|vehicle)/.test(item.lowerPath) && /(location|position|translation|spawn|start|loc)/.test(item.lowerPath)).slice(0, 30).map(({ path, vector, score }) => ({ path, vector, score }));
  report.numericCandidates = numbers.filter((item) => item.score > 0).slice(0, 350);
  report.numericDiffsShot1VsShot2 = compareShotNumericLeaves(firstShot, secondShot);

  if (!report.highConfidenceBallVectors.length) report.notes.push('No hay vector de pelota de alta confianza. Phase 43 no debe mutar aún; revisar numericCandidates y numericDiffsShot1VsShot2.');
  if (!report.highConfidenceCarVectors.length) report.notes.push('No hay vector de carro de alta confianza. Mutar solo pelota, si se confirma una ruta manual.');
  if (report.highConfidenceBallVectors.length) report.notes.push(`Candidato principal de pelota: ${report.highConfidenceBallVectors[0].path}`);
  if (report.highConfidenceCarVectors.length) report.notes.push(`Candidato principal de carro: ${report.highConfidenceCarVectors[0].path}`);
  return report;
}

function roundToFixedNumber(value, decimals = 4) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(decimals));
}

function clampTrainingValue(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function replaceSerializedNumericField(text, key, value, changedPaths, pathLabel) {
  const source = String(text ?? '');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*)-?\\d+(?:\\.\\d+)?`);
  if (!pattern.test(source)) return source;
  const replacement = `${roundToFixedNumber(value, 4).toFixed(4)}`;
  const next = source.replace(pattern, `$1${replacement}`);
  if (next !== source) changedPaths.push(`${pathLabel}.${key}`);
  return next;
}

function replaceSerializedIntegerField(text, key, value, changedPaths, pathLabel) {
  const source = String(text ?? '');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*)-?\\d+`);
  if (!pattern.test(source)) return source;
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return source;
  const next = source.replace(pattern, `$1${numeric}`);
  if (next !== source) changedPaths.push(`${pathLabel}.${key}`);
  return next;
}

function calculateVelocitySpeed(spec, fallback = 1500) {
  const velocity = spec?.ballVelocity || {};
  const vx = Number(velocity.x || 0);
  const vy = Number(velocity.y || 0);
  const vz = Number(velocity.z || 0);
  const magnitude = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (!Number.isFinite(magnitude) || magnitude < 1) return fallback;
  // Training shots become too weak if we copy very low live telemetry exactly.
  return clampTrainingValue(magnitude, 650, 2300, fallback);
}

function calculateRocketYawFromBallToTarget(ball, target, fallbackYaw = -16384) {
  const dx = Number(target?.x || 0) - Number(ball?.x || 0);
  const dy = Number(target?.y || 0) - Number(ball?.y || 0);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) + Math.abs(dy)) < 1) return fallbackYaw;
  // Unreal rotator units: 65536 units = 360 degrees. Yaw 0 points +X, 16384 points +Y.
  const radians = Math.atan2(dy, dx);
  const units = Math.round((radians / (Math.PI * 2)) * 65536);
  return Math.max(-32768, Math.min(32767, units));
}

function countDecimalsFromNumberToken(token) {
  const text = String(token || '');
  const dot = text.indexOf('.');
  return dot >= 0 ? Math.max(0, text.length - dot - 1) : 0;
}

function isValidJsonNumberToken(token) {
  try {
    JSON.parse(`{"v":${token}}`);
    return true;
  } catch {
    return false;
  }
}

function formatSameLengthNumberToken(existingToken, desiredValue, fallbackTokens = []) {
  const existing = String(existingToken || '');
  const decimals = countDecimalsFromNumberToken(existing);
  const desired = Number(desiredValue);
  const candidates = [];
  if (Number.isFinite(desired)) candidates.push(desired.toFixed(decimals));
  for (const token of fallbackTokens) candidates.push(String(token));

  for (const candidate of candidates) {
    if (candidate.length === existing.length && isValidJsonNumberToken(candidate)) return candidate;
  }
  return '';
}

function replaceSerializedNumericFieldSameLength(text, key, desiredValue, changedPaths, skippedPaths, pathLabel, fallbackTokens = []) {
  const source = String(text ?? '');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*)(-?\\d+(?:\\.\\d+)?)`);
  const match = source.match(pattern);
  if (!match) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'field-not-found' });
    return source;
  }
  const oldToken = match[2];
  const newToken = formatSameLengthNumberToken(oldToken, desiredValue, fallbackTokens);
  if (!newToken) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'same-length-token-not-available', oldToken, desiredValue });
    return source;
  }
  if (newToken === oldToken) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'same-token', oldToken, newToken });
    return source;
  }
  const next = source.replace(pattern, `$1${newToken}`);
  changedPaths.push(`${pathLabel}.${key}`);
  return next;
}

function replaceSerializedIntegerFieldSameLength(text, key, desiredValue, changedPaths, skippedPaths, pathLabel, fallbackTokens = []) {
  const source = String(text ?? '');
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
  const pattern = new RegExp(`("${escaped}"\\s*:\\s*)(-?\\d+)`);
  const match = source.match(pattern);
  if (!match) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'field-not-found' });
    return source;
  }
  const oldToken = match[2];
  const desired = Math.round(Number(desiredValue));
  const candidates = [];
  if (Number.isFinite(desired)) candidates.push(String(desired));
  for (const token of fallbackTokens) candidates.push(String(token));
  const newToken = candidates.find((token) => token.length === oldToken.length && isValidJsonNumberToken(token));
  if (!newToken) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'same-length-token-not-available', oldToken, desiredValue });
    return source;
  }
  if (newToken === oldToken) {
    skippedPaths.push({ path: `${pathLabel}.${key}`, reason: 'same-token', oldToken, newToken });
    return source;
  }
  const next = source.replace(pattern, `$1${newToken}`);
  changedPaths.push(`${pathLabel}.${key}`);
  return next;
}

function patchTrainingJsonOneShotExperiment(value, draft, generatedCode, templateShotCount) {
  // Phase 45 deliberately mutates only SerializedArchetypes[0] of shot slot #1,
  // and only with replacement tokens that keep the exact same character length.
  // This tests whether Rocket League rejects changed archetype length/offsets.
  const patched = deepCloneJson(value);
  const specs = getTrainingShotSpecsFromDraft(draft, templateShotCount).slice(0, 1);
  const report = {
    mode: 'phase45-same-length-ball-archetype-v1',
    requestedCandidates: Array.isArray(draft?.shots) ? draft.shots.length : 0,
    patchedShotCount: 0,
    templateShotCount,
    selectedArrayPath: '',
    selectedSlot: 1,
    selectedArchetypeIndex: 0,
    counters: {},
    changedPaths: [],
    skippedPaths: [],
    scalarCountFieldsUpdated: 0,
    beforeBallArchetype: '',
    afterBallArchetype: '',
    sameLength: false,
    notes: [
      'Phase 45: modifica solo SerializedArchetypes[0] del primer shot, identificado como Archetypes.Ball.Ball_GameEditor.',
      'A diferencia de Phase 44, solo escribe valores que mantienen exactamente la misma longitud de caracteres.',
      'No toca StartLocationX todavía porque 0.0000 no puede convertirse en una coordenada negativa real sin cambiar longitud.',
      'Los otros 14 shots quedan intactos. No se reemplaza el array de rounds y no se tocan contadores globales.',
    ],
    spec: specs[0] ? { id: specs[0].id, ball: specs[0].ball, car: specs[0].car, target: specs[0].target, ballVelocity: specs[0].ballVelocity, source: specs[0].source, reason: specs[0].reason } : null,
  };

  const schemaMap = buildTrainingShotSchemaMap(patched, draft, templateShotCount);
  report.schemaMapAvailable = Boolean(schemaMap?.ok);
  report.schemaMapSummary = schemaMap?.ok ? {
    selectedArrayPath: schemaMap.selectedArrayPath,
    selectedArrayLength: schemaMap.selectedArrayLength,
    serializedArchetypesMode: schemaMap.serializedArchetypesMap?.mode || '',
  } : { ok: false, notes: schemaMap?.notes || [] };

  if (!specs.length) {
    report.notes.push('No hay candidatos para probar el primer tiro. Se conserva plantilla.');
    return { json: patched, report, schemaMap };
  }

  const arrays = findTrainingShotArrays(patched);
  const target = arrays[0];
  if (!target?.parent || target.key === '' || !Array.isArray(target.array) || !isPlainObject(target.array[0])) {
    report.notes.push('No se encontró un array de rounds confiable con slot 1 parcheable. Se conserva plantilla.');
    return { json: patched, report, schemaMap };
  }

  const firstShot = target.array[0];
  const spec = specs[0];
  report.selectedArrayPath = target.path;

  if (!Array.isArray(firstShot.SerializedArchetypes) || typeof firstShot.SerializedArchetypes[0] !== 'string') {
    report.notes.push('El slot 1 no tiene SerializedArchetypes[0] como string. Se conserva plantilla.');
    return { json: patched, report, schemaMap };
  }

  const original = String(firstShot.SerializedArchetypes[0]);
  report.beforeBallArchetype = original;
  if (!/"ObjectArchetype"\s*:\s*"Archetypes\.Ball\.Ball_GameEditor"/.test(original)) {
    report.notes.push('SerializedArchetypes[0] no parece ser Archetypes.Ball.Ball_GameEditor. Se conserva plantilla.');
    return { json: patched, report, schemaMap };
  }

  const ball = spec.ball || {};
  const safeBall = {
    x: clampTrainingValue(ball.x, -4096, 4096, 0),
    y: clampTrainingValue(ball.y, -5120, 5120, 4120),
    z: clampTrainingValue(ball.z, 92, 1300, 100.4872),
  };
  const existingSpeedMatch = original.match(/"VelocityStartSpeed"\s*:\s*(-?\d+(?:\.\d+)?)/);
  const fallbackSpeed = existingSpeedMatch ? Number(existingSpeedMatch[1]) : 1500;
  const existingYawMatch = original.match(/"VelocityStartRotationY"\s*:\s*(-?\d+)/);
  const fallbackYaw = existingYawMatch ? Number(existingYawMatch[1]) : -16384;
  const yawToTarget = calculateRocketYawFromBallToTarget(safeBall, spec.target, fallbackYaw);

  let next = original;
  const pathLabel = `${target.path}[0].SerializedArchetypes[0]`;

  // Same-length, JSON-valid experiments only. X is intentionally skipped for this phase.
  report.skippedPaths.push({ path: `${pathLabel}.StartLocationX`, reason: 'phase45-intentionally-skipped-length-risk', oldToken: '0.0000', desiredValue: safeBall.x });
  next = replaceSerializedNumericFieldSameLength(next, 'StartLocationY', safeBall.y, report.changedPaths, report.skippedPaths, pathLabel, ['4266.1709', '4200.0000']);
  next = replaceSerializedNumericFieldSameLength(next, 'StartLocationZ', safeBall.z, report.changedPaths, report.skippedPaths, pathLabel, ['100.0000', '101.0000']);
  next = replaceSerializedNumericFieldSameLength(next, 'VelocityStartSpeed', calculateVelocitySpeed(spec, fallbackSpeed), report.changedPaths, report.skippedPaths, pathLabel, ['1510.0000', '1600.0000']);
  next = replaceSerializedIntegerFieldSameLength(next, 'VelocityStartRotationY', yawToTarget, report.changedPaths, report.skippedPaths, pathLabel, ['-16082', '-16000']);

  report.afterBallArchetype = next;
  report.sameLength = next.length === original.length;
  report.ballPatch = {
    requestedBall: ball,
    appliedBallPolicy: 'same-length-only; StartLocationX skipped',
    requestedVelocityStartSpeed: roundToFixedNumber(calculateVelocitySpeed(spec, fallbackSpeed), 4),
    requestedVelocityStartRotationY: yawToTarget,
    beforeLength: original.length,
    afterLength: next.length,
  };

  if (next === original || !report.changedPaths.length) {
    report.notes.push('No se encontró ningún campo same-length modificable en SerializedArchetypes[0]. Se conserva plantilla.');
    return { json: patched, report, schemaMap };
  }

  if (!report.sameLength) {
    report.notes.push('El archetype cambió de longitud; Phase 45 bloquea la mutación para no repetir 0/0. Se conserva plantilla.');
    report.changedPaths = [];
    report.afterBallArchetype = original;
    return { json: patched, report, schemaMap };
  }

  try {
    JSON.parse(next);
  } catch (error) {
    report.notes.push(`El archetype de pelota quedó como JSON inválido. Se conserva plantilla. Error: ${error instanceof Error ? error.message : String(error)}`);
    report.changedPaths = [];
    return { json: patched, report, schemaMap };
  }

  firstShot.SerializedArchetypes[0] = next;
  report.patchedShotCount = 1;
  report.notes.push(`Phase 45 cambió solo ${report.changedPaths.length} campo(s) textuales same-length del archetype de pelota en el slot 1.`);
  report.notes.push('Validación manual: Rocket League debe seguir mostrando 0/15. Si el pack sale 0/0, usar Rollback último RLA.');
  return { json: patched, report, schemaMap };
}

async function readTemShotCountWithRocketRp(rocketRp, sourceTem, debugFolder = '') {
  if (!rocketRp?.isAvailable || !sourceTem || !fs.existsSync(sourceTem)) return { ok: false, shotCount: 0, sourceTem, message: 'RocketRP no disponible o .Tem ausente.' };
  const tempRoot = path.join(app.getPath('temp'), `rlp-tem-probe-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(tempRoot, { recursive: true });
  const decoded = await runProcess(rocketRp.executablePath, ['-f', sourceTem, '-o', tempRoot, '-p']);
  if (!decoded.ok) return { ok: false, shotCount: 0, sourceTem, message: decoded.stderr || decoded.stdout || 'RocketRP no pudo leer plantilla.' };
  const jsonFile = listFilesByExtension(tempRoot, '.json')[0];
  if (!jsonFile) return { ok: false, shotCount: 0, sourceTem, message: 'RocketRP no generó JSON de plantilla.' };
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const shotCount = countLikelyTrainingShots(parsed);
    if (debugFolder) {
      try { fs.copyFileSync(jsonFile, path.join(debugFolder, `template-probe-${path.basename(sourceTem)}.json`)); } catch { /* debug best effort */ }
    }
    return { ok: true, shotCount, sourceTem, parsed, jsonFile, message: `Plantilla ${path.basename(sourceTem)}: ${shotCount} tiros detectados.` };
  } catch (error) {
    return { ok: false, shotCount: 0, sourceTem, message: error instanceof Error ? error.message : 'JSON inválido de plantilla.' };
  }
}

async function choosePlayableTemplateTem(templateTemFiles, rocketRp, draftFolder = '', preferredTemPath = '') {
  const markers = getRlaGeneratedTemMarkers();
  const preferred = String(preferredTemPath || '').toLowerCase();
  const files = (templateTemFiles || [])
    .filter((file) => file && fs.existsSync(file))
    .sort((a, b) => {
      const aPreferred = preferred && a.toLowerCase() === preferred;
      const bPreferred = preferred && b.toLowerCase() === preferred;
      if (aPreferred && !bPreferred) return -1;
      if (bPreferred && !aPreferred) return 1;
      return rankTemplateTem(b, markers) - rankTemplateTem(a, markers);
    });

  if (!files.length) return { ok: false, sourceTem: '', shotCount: 0, message: 'No hay .Tem candidatos.' };

  if (rocketRp?.isAvailable) {
    const probes = [];
    for (const file of files.slice(0, 18)) {
      const probe = await readTemShotCountWithRocketRp(rocketRp, file, draftFolder);
      probes.push({ ...probe, rankScore: rankTemplateTem(file, markers), rlaGenerated: isRlaGeneratedTem(file, markers) });
      if (probe.ok && probe.shotCount > 0 && !isRlaGeneratedTem(file, markers)) return probe;
    }
    try {
      fs.writeFileSync(path.join(draftFolder, 'template-probe-results.json'), JSON.stringify(probes.map((probe) => ({ sourceTem: probe.sourceTem, ok: probe.ok, shotCount: probe.shotCount, rankScore: probe.rankScore, rlaGenerated: probe.rlaGenerated, message: probe.message })), null, 2), 'utf8');
    } catch { /* ignore */ }
  }

  const safeBySize = files.find((file) => {
    try { return !isRlaGeneratedTem(file, markers) && fs.statSync(file).size >= 1500; } catch { return false; }
  }) || files[0];
  const safeSize = (() => { try { return fs.statSync(safeBySize).size; } catch { return 0; } })();
  if (safeSize < 1500) return { ok: false, sourceTem: safeBySize, shotCount: 0, message: `La mejor plantilla pesa ${safeSize} bytes; probablemente es 0/0.` };
  return { ok: true, sourceTem: safeBySize, shotCount: 1, message: 'Modo seguro: se seleccionó una plantilla manual con tamaño válido para evitar packs 0/0.' };
}


function copyTemplateTemWithShots({ sourceTem, targetMyTrainingDirectory, generatedTemFileName, draftFolder, draft, reason, mode = 'verified-template-with-shots', manifestNote = '' }) {
  if (!sourceTem || !fs.existsSync(sourceTem)) return { ok: false, message: 'No se encontró .Tem plantilla para instalar con tiros.' };

  try {
    assertSafeMyTrainingTarget(targetMyTrainingDirectory);
  } catch (error) {
    return { ok: false, blocked: true, message: error instanceof Error ? error.message : 'Destino bloqueado por seguridad.' };
  }

  const targetTem = path.join(targetMyTrainingDirectory, generatedTemFileName);
  const generatedCode = generatedTemFileName.replace(/\.tem$/i, '');
  const safetySnapshot = createTrainingInstallSafetySnapshot(targetMyTrainingDirectory, generatedTemFileName);

  fs.copyFileSync(sourceTem, targetTem);

  const manifestTarget = path.join(path.dirname(targetMyTrainingDirectory), `RLA_${generatedCode}_manifest.json`);
  fs.writeFileSync(manifestTarget, JSON.stringify({
    generatedBy: 'RL Performance Lab',
    mode,
    safetyMode: 'rla_only_with_rollback',
    generatedCode,
    installedTemPath: targetTem,
    templateTemPath: sourceTem,
    draftFolder,
    safetySnapshotPath: path.join(safetySnapshot.backupRoot, 'snapshot.json'),
    reason,
    note: manifestNote || 'Instalación segura: conserva tiros de una plantilla real para evitar packs 0/0. La recreación física exacta de tus tiros requiere telemetría live y parcheo de shots en el JSON de RocketRP.',
    draftShots: draft?.shots ?? [],
    createdAt: new Date().toISOString(),
  }, null, 2), 'utf8');

  const installRecord = writeLastTrainingInstallRecord({
    mode,
    backupRoot: safetySnapshot.backupRoot,
    targetMyTrainingDirectory,
    installedTemPath: targetTem,
    manifestPath: manifestTarget,
    templateTemPath: sourceTem,
    generatedCode,
    generatedTemFileName,
    draftFolder,
    reason,
  });

  try {
    fs.writeFileSync(path.join(draftFolder, 'installed-visible-pack-note.txt'), [
      'Pack instalado con tiros usando una plantilla .Tem real.',
      `Source: ${sourceTem}`,
      `Target: ${targetTem}`,
      `Manifest: ${manifestTarget}`,
      `Rollback: ${installRecord.backupRoot}`,
      reason,
      'Esto evita packs 0/0. Si Rocket League no abre, usá Rollback último pack RLA desde la app o borrá solo el target anterior.',
    ].join('\n'), 'utf8');
  } catch { /* best effort */ }
  return {
    ok: true,
    installedTemPath: targetTem,
    generatedCode,
    fallbackUsed: true,
    backupRoot: safetySnapshot.backupRoot,
    manifestPath: manifestTarget,
    message: mode === 'phase40-strict-template-clone-v1'
      ? `Phase 40 instalado: clon exacto de plantilla con shots. Rollback preparado. ${reason}`
      : `Pack instalado con tiros reales de plantilla validada. Rollback preparado. ${reason}`,
  };
}


async function fallbackClonePlayableTemplate({ reason, playable, targetMyTrainingDirectory, generatedTemFileName, draftFolder, draft }) {
  if (!playable?.sourceTem) {
    return { ok: false, blocked: true, installedTemPath: '', generatedCode: '', message: reason || 'No hay plantilla jugable para fallback.' };
  }

  return copyTemplateTemWithShots({
    sourceTem: playable.sourceTem,
    targetMyTrainingDirectory,
    generatedTemFileName,
    draftFolder,
    draft,
    reason: `Fallback clon seguro: ${reason}`,
  });
}

function summarizeTemplateCandidate(filePath, rocketRpProbe, markers) {
  const stat = (() => { try { return fs.statSync(filePath); } catch { return null; } })();
  return {
    fileName: path.basename(filePath || ''),
    path: filePath,
    sizeBytes: stat?.size ?? 0,
    modifiedAt: stat ? new Date(stat.mtimeMs).toISOString() : '',
    rlaGenerated: isRlaGeneratedTem(filePath, markers),
    rankScore: rankTemplateTem(filePath, markers),
    ok: Boolean(rocketRpProbe?.ok),
    shotCount: Number(rocketRpProbe?.shotCount || 0),
    message: rocketRpProbe?.message || 'Sin probe RocketRP.',
  };
}

async function inspectTrainingTemplate() {
  const status = getTrainingPackStatus('Inspección de plantilla iniciada.');
  const template = status.activeTemplate;
  const rocketRp = getRocketRpTrainingCliStatus();
  const inspectedAt = new Date().toISOString();
  const reportFolder = path.join(resolveRlaTrainingPackLandingDirectory(), '_template_inspector');
  fs.mkdirSync(reportFolder, { recursive: true });

  if (!template?.templateDirectory || !fs.existsSync(template.templateDirectory)) {
    const templateInspection = {
      ok: false,
      inspectedAt,
      reportPath: '',
      message: 'No hay plantilla activa. Primero creá un training pack manual en Rocket League o seleccioná una carpeta MyTraining/Downloaded/Favorites con .Tem reales.',
      candidates: [],
    };
    return { ...status, ok: false, templateInspection, message: templateInspection.message };
  }

  const markers = getRlaGeneratedTemMarkers();
  const allTemFiles = findTemFiles(template.templateDirectory);
  const temFiles = template.selectedTemPath && fs.existsSync(template.selectedTemPath)
    ? [template.selectedTemPath, ...allTemFiles.filter((filePath) => filePath.toLowerCase() !== template.selectedTemPath.toLowerCase())].slice(0, 24)
    : allTemFiles.slice(0, 24);
  const candidates = [];
  let selected = null;
  let selectedFields = [];

  for (const filePath of temFiles) {
    let probe = { ok: false, shotCount: 0, sourceTem: filePath, message: 'RocketRP no configurado; se inspeccionó tamaño/nombre solamente.' };
    if (rocketRp.isAvailable) probe = await readTemShotCountWithRocketRp(rocketRp, filePath, reportFolder);
    const candidate = summarizeTemplateCandidate(filePath, probe, markers);
    candidates.push(candidate);

    if (!selected && probe.ok && Number(probe.shotCount || 0) > 0 && !candidate.rlaGenerated) {
      selected = candidate;
      if (probe.parsed) selectedFields = collectKnownTrainingPackFields(probe.parsed);
    }
  }

  if (!selected) {
    selected = candidates.find((candidate) => candidate.sizeBytes >= 1500 && !candidate.rlaGenerated) || candidates[0] || null;
  }

  const templateInspection = {
    ok: Boolean(selected && (selected.shotCount > 0 || selected.sizeBytes >= 1500)),
    inspectedAt,
    reportPath: path.join(reportFolder, 'template-inspection-report.json'),
    templateDirectory: template.templateDirectory,
    rocketRpAvailable: rocketRp.isAvailable,
    selected,
    candidates,
    knownTextFields: selectedFields,
    nextStep: selected?.shotCount > 0
      ? 'Plantilla jugable detectada. Crear .Tem seguro intentará roundtrip RocketRP y, si falla, clonará esta plantilla para evitar 0/0.'
      : 'No se confirmó shotCount > 0. Creá un training pack manual con 3+ tiros dentro de Rocket League y seleccioná su MyTraining como plantilla.',
    message: selected?.shotCount > 0
      ? `Plantilla OK: ${selected.fileName} con ${selected.shotCount} shots detectados.`
      : 'Inspección terminada, pero no se confirmó una plantilla con shots > 0.',
  };

  fs.writeFileSync(templateInspection.reportPath, JSON.stringify(templateInspection, null, 2), 'utf8');
  return {
    ...getTrainingPackStatus(templateInspection.message),
    ok: templateInspection.ok,
    templateInspection,
    message: templateInspection.message,
  };
}

function collectKnownTrainingPackFields(value) {
  const fields = [];
  const visit = (node, pointer = '$', depth = 0) => {
    if (!node || depth > 14) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${pointer}[${index}]`, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    for (const [key, childValue] of Object.entries(node)) {
      const lower = key.toLowerCase();
      if (typeof childValue === 'string' && /(title|name|description|tag|category)/i.test(lower)) {
        fields.push({ pointer: `${pointer}.${key}`, key, sample: childValue.slice(0, 80) });
      }
      visit(childValue, `${pointer}.${key}`, depth + 1);
    }
  };
  visit(value);
  return fields.slice(0, 120);
}

function readJsonFileOrNull(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function tryParseJsonFromStdout(stdout) {
  if (!stdout || typeof stdout !== 'string') return null;
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first < 0 || last <= first) return null;
  try {
    return JSON.parse(trimmed.slice(first, last + 1));
  } catch {
    return null;
  }
}

async function decodeTemToJsonWithRocketRp(rocketRp, sourceTem, debugFolder, label = 'template') {
  const tempRoot = path.join(app.getPath('temp'), `rlp-tem-decode-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(tempRoot, { recursive: true });

  const attempts = [
    { args: ['-f', sourceTem, '-o', tempRoot, '-p'], cwd: tempRoot },
    { args: ['-f', sourceTem, '-p', '-o', tempRoot], cwd: tempRoot },
    { args: ['-f', sourceTem, '-p'], cwd: tempRoot },
  ];

  const errors = [];
  for (const attempt of attempts) {
    const result = await runProcess(rocketRp.executablePath, attempt.args, { cwd: attempt.cwd });
    if (!result.ok) {
      errors.push({ args: attempt.args, code: result.code, stderr: result.stderr, stdout: result.stdout });
      continue;
    }

    const jsonFiles = listFilesByExtension(tempRoot, '.json');
    const jsonFile = jsonFiles[0];
    let parsed = jsonFile ? readJsonFileOrNull(jsonFile) : null;
    if (!parsed) parsed = tryParseJsonFromStdout(result.stdout);
    if (!parsed) {
      errors.push({ args: attempt.args, code: result.code, stderr: result.stderr, stdout: result.stdout, message: 'RocketRP terminó, pero no se encontró JSON parseable.' });
      continue;
    }

    if (debugFolder) {
      try {
        fs.writeFileSync(path.join(debugFolder, `${label}-decoded.rocketrp.json`), JSON.stringify(parsed, null, 2), 'utf8');
        fs.writeFileSync(path.join(debugFolder, `${label}-decode-command.json`), JSON.stringify({ args: attempt.args, tempRoot, stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 4000) }, null, 2), 'utf8');
      } catch { /* debug best effort */ }
    }

    return { ok: true, parsed, jsonFile, tempRoot, args: attempt.args, message: 'RocketRP decodificó .Tem a JSON.' };
  }

  if (debugFolder) {
    try { fs.writeFileSync(path.join(debugFolder, `${label}-decode-errors.json`), JSON.stringify(errors, null, 2), 'utf8'); } catch { /* ignore */ }
  }
  return { ok: false, parsed: null, jsonFile: '', tempRoot, errors, message: 'RocketRP no pudo decodificar la plantilla .Tem a JSON.' };
}

function listNewTemFiles(directory, beforeSet) {
  return listFilesByExtension(directory, '.tem')
    .filter((file) => !beforeSet.has(path.resolve(file).toLowerCase()))
    .sort((a, b) => {
      try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
    });
}

async function serializeTrainingJsonWithRocketRp(rocketRp, jsonPath, debugFolder) {
  const tempRoot = path.join(app.getPath('temp'), `rlp-tem-serialize-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(tempRoot, { recursive: true });
  const localJson = path.join(tempRoot, path.basename(jsonPath));
  fs.copyFileSync(jsonPath, localJson);

  const before = new Set(listFilesByExtension(tempRoot, '.tem').map((file) => path.resolve(file).toLowerCase()));
  const attempts = [
    { args: ['-f', localJson, '-m', 'Serialize', '-o', tempRoot], cwd: tempRoot },
    { args: ['-f', localJson, '-o', tempRoot, '-m', 'Serialize'], cwd: tempRoot },
    { args: ['-f', localJson, '-m', 'Serialize'], cwd: tempRoot },
    { args: ['-m', 'Serialize', '-f', localJson, '-o', tempRoot], cwd: tempRoot },
  ];

  const errors = [];
  for (const attempt of attempts) {
    const result = await runProcess(rocketRp.executablePath, attempt.args, { cwd: attempt.cwd });
    const newTemFiles = listNewTemFiles(tempRoot, before);
    if (result.ok && newTemFiles.length) {
      if (debugFolder) {
        try { fs.writeFileSync(path.join(debugFolder, 'serialize-command.json'), JSON.stringify({ args: attempt.args, tempRoot, temFile: newTemFiles[0], stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 4000) }, null, 2), 'utf8'); } catch { /* ignore */ }
      }
      return { ok: true, temFile: newTemFiles[0], tempRoot, args: attempt.args, message: 'RocketRP serializó JSON a .Tem.' };
    }
    errors.push({ args: attempt.args, code: result.code, stdout: result.stdout, stderr: result.stderr, newTemFiles });
  }

  if (debugFolder) {
    try { fs.writeFileSync(path.join(debugFolder, 'serialize-errors.json'), JSON.stringify(errors, null, 2), 'utf8'); } catch { /* ignore */ }
  }
  return { ok: false, temFile: '', tempRoot, errors, message: 'RocketRP no produjo un .Tem serializado desde el JSON.' };
}

function writeSafePackManifest({ targetMyTrainingDirectory, generatedTemFileName, targetTem, sourceTem, draftFolder, draft, generatedCode, validation }) {
  const manifestTarget = path.join(path.dirname(targetMyTrainingDirectory), `RLA_${generatedCode}_manifest.json`);
  fs.writeFileSync(manifestTarget, JSON.stringify({
    generatedBy: 'RL Performance Lab',
    mode: validation?.geometryWriter?.patchedShotCount ? 'adaptive-shot-geometry-v1' : 'safe-pack-writer-v1',
    generatedCode,
    installedTemPath: targetTem,
    generatedTemFileName,
    templateTemPath: sourceTem,
    draftFolder,
    validation,
    note: validation?.geometryWriter?.patchedShotCount
      ? 'Fase 30: decodifica plantilla .Tem, clona/parchea shots detectados con geometría derivada de live/replay candidates, serializa, relee y bloquea si shots === 0.'
      : 'Safe mode: decodifica plantilla .Tem, modifica metadata confirmada, serializa, relee y bloquea si shots === 0.',
    limitation: validation?.geometryWriter?.patchedShotCount
      ? 'La precisión depende de la telemetría disponible. Live Stats API con ImpactLocation produce los tiros más parecidos; replays sin frame telemetry usan estimaciones por evento.'
      : 'No se encontró geometría suficiente o schema parcheable; el writer conservó la plantilla para no crear packs 0/0.',
    draftShots: draft?.shots ?? [],
    createdAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  return manifestTarget;
}

async function installTrainingPackWithRocketRp(draftFolder, template, draft, targetMyTrainingDirectory = '') {
  // Phase 46 locks the installer to a verified-template clone strategy.
  // Prior phases proved that RocketRP Deserialize is useful for inspection, but RocketRP Serialize
  // changes the final .Tem byte layout/size and Rocket League then shows 0/0. Therefore this function
  // no longer installs any RocketRP-serialized mutation. It writes reports/plans, then installs a
  // byte-for-byte copy of the selected playable template so the app never creates another 0/0 pack.
  const rocketRp = getRocketRpTrainingCliStatus();
  const target = targetMyTrainingDirectory || template?.installTargetMyTrainingDirectory || resolveDefaultMyTrainingDirectory();
  const candidates = Array.isArray(draft?.shots) ? draft.shots : [];
  const generatedTemFileName = buildGeneratedTemFileName(draftFolder);
  const generatedCode = generatedTemFileName.replace(/\.tem$/i, '');

  const debugPayload = {
    generatedAt: new Date().toISOString(),
    mode: 'phase46-serializer-guard-template-clone-v1',
    targetMyTrainingDirectory: target,
    rocketRp: {
      isAvailable: rocketRp.isAvailable,
      executablePath: rocketRp.executablePath,
      source: rocketRp.source,
      diagnostics: rocketRp.diagnostics,
    },
    candidateCount: candidates.length,
    candidates,
  };

  try { fs.writeFileSync(path.join(draftFolder, 'safe-writer-start.json'), JSON.stringify(debugPayload, null, 2), 'utf8'); } catch { /* best effort */ }

  if (!rocketRp.isAvailable) {
    return { ok: false, blocked: true, installedTemPath: '', generatedCode: '', message: rocketRp.message || 'RocketRP TrainingCLI no está completo.' };
  }
  if (!target || !directoryExists(target)) {
    return { ok: false, blocked: true, installedTemPath: '', generatedCode: '', message: 'No se detectó carpeta MyTraining destino. Seleccioná Training\\0000000000000000\\MyTraining.' };
  }

  const templateDirectory = template?.templateDirectory || template?.myTrainingDirectory || '';
  const templateTemFiles = template?.selectedTemPath && fs.existsSync(template.selectedTemPath)
    ? [template.selectedTemPath, ...findTemFiles(templateDirectory).filter((filePath) => filePath.toLowerCase() !== template.selectedTemPath.toLowerCase())]
    : findTemFiles(templateDirectory);
  const playable = await choosePlayableTemplateTem(templateTemFiles, rocketRp, draftFolder, template?.selectedTemPath || '');
  if (!playable.ok || playable.shotCount <= 0) {
    return {
      ok: false,
      blocked: true,
      installedTemPath: '',
      generatedCode: '',
      message: `Instalación bloqueada: no se encontró plantilla .Tem válida con shots > 0. ${playable.message || ''}`.trim(),
    };
  }

  const plannedCandidateShots = candidates.slice(0, Math.min(Number(playable.shotCount || 0), candidates.length, 15)).map((candidate, index) => ({
    slot: index + 1,
    id: candidate?.id || '',
    replayFileName: candidate?.replayFileName || candidate?.matchLabel || 'candidate',
    rating: Number(candidate?.shotScore || 0),
    reason: candidate?.reason || '',
    impactLocation: candidate?.shotTelemetry?.impactLocation || candidate?.shotTelemetry?.ballLocation || null,
    ballVelocity: candidate?.shotTelemetry?.ballVelocity || null,
  }));

  const phase46Report = {
    mode: 'phase46-serializer-guard-template-clone-v1',
    createdAt: new Date().toISOString(),
    ok: true,
    installMode: 'clone-only',
    mutationInstallBlocked: true,
    reason: 'RocketRP Serialize cambia el tamaño/layout del .Tem y Rocket League lo muestra como 0/0. Phase 46 bloquea mutaciones serializadas e instala solo un clon byte-for-byte de una plantilla jugable.',
    selectedTemplateTem: playable.sourceTem,
    templateShotCount: playable.shotCount,
    targetMyTrainingDirectory: target,
    generatedTemFileName,
    generatedCode,
    candidateCount: candidates.length,
    plannedCandidateShots,
    knownFindings: {
      cloneWorksInRocketLeague: true,
      rocketRpDeserializeUsefulForInspection: true,
      rocketRpSerializeUnsafeForInstall: true,
      lastObservedSerializedSizeDeltaBytes: -48,
      lastObservedOutcome: 'Rocket League muestra 0/0 cuando se instala un .Tem mutado por RocketRP Serialize.',
    },
    nextWriterNeeded: 'Implementar writer binario real o una estrategia de plantillas manuales por familias. No instalar .Tem reserializados por RocketRP hasta tener validación externa.',
    notes: [
      'Phase 46 prioriza cero corrupción y cero 0/0: instala clon exacto de la plantilla seleccionada.',
      'Los candidatos live/replay se conservan en candidate-shot-plan.json y en este reporte para futuras mutaciones reales.',
      'Este pack puede verse igual a la plantilla dummy; eso es intencional mientras no exista writer binario seguro.',
    ],
  };

  try {
    fs.writeFileSync(path.join(draftFolder, 'phase46-serializer-guard-report.json'), JSON.stringify(phase46Report, null, 2), 'utf8');
    fs.writeFileSync(path.join(draftFolder, 'candidate-shot-plan.json'), JSON.stringify(plannedCandidateShots, null, 2), 'utf8');
  } catch { /* best effort */ }

  const decoded = await decodeTemToJsonWithRocketRp(rocketRp, playable.sourceTem, draftFolder, 'template');
  if (decoded.ok && decoded.parsed) {
    const templateShotCount = countLikelyTrainingShots(decoded.parsed);
    const patchPreview = patchTrainingJsonOneShotExperiment(decoded.parsed, draft, generatedCode, templateShotCount);
    const schemaMap = buildTrainingShotSchemaMap(decoded.parsed, draft, templateShotCount);
    const previewReport = {
      mode: 'phase46-mutation-preview-only-v1',
      createdAt: new Date().toISOString(),
      installBlocked: true,
      templateShotCount,
      selectedTemplateTem: playable.sourceTem,
      plannedMutation: patchPreview.report,
      serializerGuard: {
        rocketRpSerializeInstallAllowed: false,
        reason: 'Mutation preview is saved for analysis only. Phase 46 does not serialize/install mutated JSON.',
      },
    };
    try {
      fs.writeFileSync(path.join(draftFolder, 'phase46-mutation-preview-only.json'), JSON.stringify(previewReport, null, 2), 'utf8');
      fs.writeFileSync(path.join(draftFolder, 'phase45-same-length-archetype-report.json'), JSON.stringify(patchPreview.report, null, 2), 'utf8');
      fs.writeFileSync(path.join(draftFolder, 'phase42-shot-schema-map.json'), JSON.stringify(schemaMap, null, 2), 'utf8');
      if (schemaMap?.serializedArchetypesMap) fs.writeFileSync(path.join(draftFolder, 'phase43-serialized-archetypes-map.json'), JSON.stringify(schemaMap.serializedArchetypesMap, null, 2), 'utf8');
      fs.writeFileSync(path.join(draftFolder, 'rla-phase46-preview-not-installed.rocketrp.json'), JSON.stringify(patchPreview.json, null, 2), 'utf8');
    } catch { /* best effort */ }
  } else {
    try {
      phase46Report.decodeWarning = decoded?.message || 'No se pudo decodificar plantilla para preview, pero se puede clonar byte-for-byte.';
      fs.writeFileSync(path.join(draftFolder, 'phase46-serializer-guard-report.json'), JSON.stringify(phase46Report, null, 2), 'utf8');
    } catch { /* best effort */ }
  }

  return copyTemplateTemWithShots({
    sourceTem: playable.sourceTem,
    targetMyTrainingDirectory: target,
    generatedTemFileName,
    draftFolder,
    draft,
    mode: 'phase46-serializer-guard-template-clone-v1',
    manifestNote: 'Phase 46: mutaciones por RocketRP Serialize bloqueadas. Se instala clon exacto de plantilla jugable para evitar 0/0; los tiros candidatos quedan guardados como plan.',
    reason: `Phase 46 instaló clon seguro (${playable.shotCount} shots detectados). No se instaló geometría mutada porque RocketRP Serialize invalida el .Tem para Rocket League.`,
  });
}

async function installTrainingPackDraft(draftFolder) {
  const status = getTrainingPackStatus();
  const requestedDraftFolder = typeof draftFolder === 'string' ? draftFolder : '';
  const latestDraftFolder = status.latestDraftFolder || status.draftFolders?.[0] || '';
  const selectedDraftFolder = requestedDraftFolder && fs.existsSync(requestedDraftFolder)
    ? requestedDraftFolder
    : latestDraftFolder;

  if (!selectedDraftFolder || !fs.existsSync(selectedDraftFolder)) {
    return {
      ...status,
      ok: false,
      draftFolder: '',
      message: 'No hay draft RLA instalable todavía. Primero apretá Generar seed. No es por falta de replays: se necesita crear el draft antes de Crear .Tem seguro.',
    };
  }

  draftFolder = selectedDraftFolder;
  const template = status.activeTemplate;
  if (!template?.myTrainingDirectory || !fs.existsSync(template.myTrainingDirectory)) {
    return {
      ...status,
      ok: false,
      draftFolder,
      message: 'No hay plantilla MyTraining válida. Seleccioná la carpeta que contiene tu .Tem real: Training\\0000000000000000\\MyTraining.',
    };
  }

  const draft = readDraftPayload(draftFolder);
  const generated = await installTrainingPackWithRocketRp(draftFolder, template, draft, status.targetMyTrainingDirectory || status.selectedMyTrainingDirectory || status.myTrainingDirectories?.[0] || '');
  if (!generated.ok) {
    return {
      ...getTrainingPackStatus(generated.message),
      ok: false,
      draftFolder,
      message: generated.message,
    };
  }

  const installedMyTrainingPath = generated.installedTemPath ? path.dirname(generated.installedTemPath) : template.myTrainingDirectory;
  return {
    ...getTrainingPackStatus(generated.message),
    ok: true,
    draftFolder,
    installedPath: path.dirname(installedMyTrainingPath),
    installedMyTrainingPath,
    installedTemPath: generated.installedTemPath,
    generatedCode: generated.generatedCode,
    message: generated.message,
  };
}

function scanLaunchLogForRanks() {
  const logPath = resolveLaunchLogPath();
  const scannedAt = new Date().toISOString();

  if (!fs.existsSync(logPath)) {
    return {
      ok: false,
      scannedAt,
      logPath,
      message: 'No se encontró Launch.log en Documents/OneDrive. Abrí Rocket League una vez o seleccioná la fuente manualmente.',
      snapshots: [],
      evidenceLines: [],
    };
  }

  const stat = fs.statSync(logPath);
  const maxBytes = Math.min(stat.size, 3 * 1024 * 1024);
  const fd = fs.openSync(logPath, 'r');
  const buffer = Buffer.alloc(maxBytes);
  fs.readSync(fd, buffer, 0, maxBytes, Math.max(0, stat.size - maxBytes));
  fs.closeSync(fd);

  const lines = buffer.toString('utf8').split(/\r?\n/).slice(-5000);
  const candidates = [];
  const evidenceLines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/(mmr|skill\s*rating|skillrating|rank|tier|division|playlist)/i.test(line)) continue;
    const snapshot = parseRankSnapshotFromLine(line, lines[index - 1] ?? '');
    if (snapshot) {
      candidates.push(snapshot);
      evidenceLines.push(snapshot.evidenceLine);
    }
  }

  const latestByPlaylist = new Map();
  candidates.forEach((candidate) => latestByPlaylist.set(candidate.playlist, candidate));
  const snapshots = [...latestByPlaylist.values()].map(({ evidenceLine, ...snapshot }) => snapshot);

  return {
    ok: snapshots.length > 0,
    scannedAt,
    logPath,
    message: snapshots.length
      ? `Se encontraron ${snapshots.length} snapshot(s) de rango en Launch.log. Fuente experimental: confirmá contra el juego si algo no cuadra.`
      : 'Launch.log fue leído, pero no se encontraron líneas claras de MMR/rango. Usá entrada manual o perfil externo por ahora.',
    snapshots,
    evidenceLines: evidenceLines.slice(-8),
  };
}


// â”€â”€â”€ PHASE 47A â€” ROUNDTRIP + BINARY WRITER LAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ END PHASE 47A â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.whenReady().then(() => {
  hydrateDesktopConfig();
  ensureDefaultDesktopPaths();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (replayWatcher) {
    replayWatcher.close();
    replayWatcher = null;
  }
  stopStatsApiStream();
});



function ensureMmrOcrDirectory() {
  const directory = path.join(app.getPath('userData'), 'mmr-ocr');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.join(directory, 'captures'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'samples'), { recursive: true });
  return directory;
}

function getMmrOcrStatus(message = 'OCR local preparado. Capturá pantalla post-game y confirmá el MMR para guardar snapshot.') {
  const baseDirectory = ensureMmrOcrDirectory();
  const samplesDirectory = path.join(baseDirectory, 'samples');
  const capturesDirectory = path.join(baseDirectory, 'captures');
  const sampleCount = fs.readdirSync(samplesDirectory).filter((file) => /\.(png|json)$/i.test(file)).length;
  return {
    ok: true,
    message,
    baseDirectory,
    samplesDirectory,
    capturesDirectory,
    sampleCount,
    modelStatus: sampleCount >= 20 ? 'dataset_local_en_crecimiento' : 'sin_modelo_entrenado',
  };
}

async function capturePrimaryDisplayForOcr() {
  let shouldRestoreWindow = false;
  let wasMinimized = false;

  try {
    // Phase 48: hide app window before OCR screen capture so the capture sees Rocket League, not RLA.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      shouldRestoreWindow = true;
      wasMinimized = mainWindow.isMinimized();
      mainWindow.hide();
      await new Promise((resolve) => setTimeout(resolve, 850));
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false,
    });
    const source = sources[0];
    if (!source || source.thumbnail.isEmpty()) {
      return { ok: false, message: 'No se pudo capturar la pantalla. Probá con Rocket League en modo ventana sin bordes y dejalo visible detrás de RLA.', dataUrl: '', width: 0, height: 0, capturedAt: new Date().toISOString() };
    }
    const dataUrl = source.thumbnail.toDataURL();
    const size = source.thumbnail.getSize();
    const capturedAt = new Date().toISOString();
    const capturesDirectory = path.join(ensureMmrOcrDirectory(), 'captures');
    const filePath = path.join(capturesDirectory, `mmr-capture-${Date.now()}.png`);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return { ok: true, message: 'Captura local guardada. RLA se ocultó brevemente; dejá Rocket League visible detrás para que la muestra sea del juego.', dataUrl, width: size.width, height: size.height, capturedAt, filePath };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Error al capturar pantalla.', dataUrl: '', width: 0, height: 0, capturedAt: new Date().toISOString() };
  } finally {
    if (shouldRestoreWindow && mainWindow && !mainWindow.isDestroyed()) {
      if (wasMinimized) mainWindow.minimize();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }
}

function saveMmrOcrSample(payload = {}) {
  try {
    const baseDirectory = ensureMmrOcrDirectory();
    const samplesDirectory = path.join(baseDirectory, 'samples');
    const id = String(payload.id || `mmr-sample-${Date.now()}`).replace(/[^a-z0-9-_]/gi, '-');
    const jsonPath = path.join(samplesDirectory, `${id}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({
      id,
      savedAt: new Date().toISOString(),
      app: 'RL Performance Lab',
      type: 'mmr-ocr-sample',
      payload,
    }, null, 2), 'utf8');

    if (typeof payload.dataUrl === 'string' && payload.dataUrl.startsWith('data:image/png;base64,')) {
      const imagePath = path.join(samplesDirectory, `${id}.png`);
      fs.writeFileSync(imagePath, Buffer.from(payload.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }

    return { ...getMmrOcrStatus('Muestra OCR guardada para entrenar/calibrar el lector local.'), ok: true, samplePath: jsonPath };
  } catch (error) {
    return { ...getMmrOcrStatus(), ok: false, message: error instanceof Error ? error.message : 'No se pudo guardar la muestra OCR.' };
  }
}

ipcMain.handle('desktop:get-stats-api-config-status', async () => getStatsApiConfigStatus());
ipcMain.handle('desktop:select-stats-api-config', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar DefaultStatsAPI.ini',
    defaultPath: resolveStatsApiConfigPath(),
    filters: [{ name: 'Rocket League Stats API config', extensions: ['ini'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return getStatsApiConfigStatus();
  writeDesktopConfig({ statsApiConfigPath: result.filePaths[0] });
  return getStatsApiConfigStatus();
});
ipcMain.handle('desktop:configure-stats-api', async (_event, payload) => configureStatsApi(payload?.configPath, payload?.port, payload?.packetSendRate));

ipcMain.handle('desktop:get-mmr-ocr-status', async () => getMmrOcrStatus());
ipcMain.handle('desktop:capture-mmr-screen', async () => capturePrimaryDisplayForOcr());
ipcMain.handle('desktop:save-mmr-ocr-sample', async (_event, payload) => saveMmrOcrSample(payload));
ipcMain.handle('desktop:open-mmr-ocr-folder', async () => {
  const directory = ensureMmrOcrDirectory();
  await shell.openPath(directory);
  return directory;
});
ipcMain.handle('desktop:get-training-pack-status', async () => getTrainingPackStatus());
ipcMain.handle('desktop:run-phase47-lab', async () => runPhase47Lab());
ipcMain.handle('desktop:create-training-pack-draft', async (_event, draft) => writeTrainingPackDraft(draft));
ipcMain.handle('desktop:install-training-pack-draft', async (_event, draftFolder) => installTrainingPackDraft(draftFolder));
ipcMain.handle('desktop:inspect-training-template', async () => inspectTrainingTemplate());
ipcMain.handle('desktop:select-my-training-directory', async () => selectMyTrainingDirectory());
ipcMain.handle('desktop:select-training-template-directory', async () => selectTrainingTemplateDirectory());
ipcMain.handle('desktop:select-rocketrp-training-cli', async () => selectRocketRpTrainingCliExecutable());
ipcMain.handle('desktop:check-stats-api-port', async (_event, payload) => checkStatsApiPort(Number(payload?.port) || 49123));
ipcMain.handle('desktop:start-stats-api-stream', async (_event, payload) => startStatsApiStream(payload || {}));
ipcMain.handle('desktop:stop-stats-api-stream', async () => stopStatsApiStream());
ipcMain.handle('desktop:cleanup-generated-training-packs', async () => cleanupGeneratedTrainingPacks());
ipcMain.handle('desktop:rollback-last-training-pack-install', async () => rollbackLastTrainingPackInstall());
ipcMain.handle('desktop:open-training-safety-backups', async () => openTrainingSafetyBackups());
ipcMain.handle('desktop:open-training-pack-landing', async () => {
  const dir = resolveRlaTrainingPackLandingDirectory();
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return dir;
});

ipcMain.handle('desktop:get-default-replay-directory', async () => replayDirectory);
ipcMain.handle('desktop:get-rattletrap-status', async () => getRattletrapStatus());
ipcMain.handle('desktop:scan-rank-log', async () => scanLaunchLogForRanks());

ipcMain.handle('desktop:select-replay-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de replays de Rocket League',
    defaultPath: replayDirectory,
    properties: ['openDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) return getWatcherStatus('Selección cancelada');

  if (replayWatcher) {
    replayWatcher.close();
    replayWatcher = null;
  }

  replayDirectory = result.filePaths[0];
  writeDesktopConfig({ replayDirectory });
  const files = scanReplayFiles();
  detectedReplayPaths = new Set(files.map((file) => file.path));
  return getWatcherStatus('Carpeta de replays actualizada');
});

ipcMain.handle('desktop:select-rattletrap-executable', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar rattletrap.exe',
    defaultPath: configuredRattletrapPath || getBundledRattletrapPath(),
    filters: [{ name: 'Rattletrap executable', extensions: ['exe'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths[0]) return getRattletrapStatus();

  configuredRattletrapPath = result.filePaths[0];
  writeDesktopConfig({ rattletrapPath: configuredRattletrapPath });
  return getRattletrapStatus();
});


ipcMain.handle('desktop:select-rrrocket-executable', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar rrrocket.exe',
    defaultPath: configuredRrrocketPath || getBundledRrrocketPath(),
    filters: [{ name: 'rrrocket executable', extensions: ['exe'] }],
    properties: ['openFile'],
  });

  if (result.canceled || !result.filePaths[0]) return getRattletrapStatus();

  configuredRrrocketPath = result.filePaths[0];
  writeDesktopConfig({ rrrocketPath: configuredRrrocketPath });
  return getRattletrapStatus();
});

ipcMain.handle('desktop:open-parsed-replay-folder', async () => {
  const parsedDirectory = ensureParsedReplayDirectory();
  await shell.openPath(parsedDirectory);
  return parsedDirectory;
});

ipcMain.handle('desktop:scan-replay-folder', async () => {
  const files = scanReplayFiles();
  detectedReplayPaths = new Set(files.map((file) => file.path));
  return files;
});

ipcMain.handle('desktop:start-replay-watcher', async () => {
  if (!ensureReplayDirectory()) {
    return getWatcherStatus('No se encontró la carpeta local de replays. Seleccioná la carpeta correcta o guardá una repetición primero.');
  }

  if (replayWatcher) return getWatcherStatus('Watcher ya estaba activo');

  const currentFiles = scanReplayFiles();
  detectedReplayPaths = new Set(currentFiles.map((file) => file.path));

  replayWatcher = fs.watch(replayDirectory, { persistent: true }, (_eventType, fileName) => {
    if (!fileName || !fileName.toLowerCase().endsWith('.replay')) return;
    const filePath = path.join(replayDirectory, fileName);
    setTimeout(() => emitReplayDetected(filePath), 900);
  });

  replayWatcher.on('error', () => {
    replayWatcher = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('replay:watcher-error', {
        message: 'El watcher se detuvo. Revisá permisos o carpeta de replays.',
      });
    }
  });

  return getWatcherStatus('Watcher activo. Guardá un replay nuevo para detectarlo.');
});

ipcMain.handle('desktop:stop-replay-watcher', async () => {
  if (replayWatcher) {
    replayWatcher.close();
    replayWatcher = null;
  }
  return getWatcherStatus('Watcher detenido');
});

ipcMain.handle('desktop:analyze-replay-preview', async (_event, replayPath) => {
  const fileName = path.basename(replayPath);
  const replayId = Buffer.from(replayPath).toString('base64url');
  const rattletrapStatus = getRattletrapStatus();

  if (!fs.existsSync(replayPath)) throw new Error('El replay seleccionado ya no existe en disco.');

  if (!rattletrapStatus.isAvailable) {
    return {
      replayId,
      fileName,
      replayPath,
      status: 'pendiente_rattletrap',
      summary: rattletrapStatus.message,
      rattletrapPath: rattletrapStatus.executablePath,
      extractedMetrics: createEmptyMetrics(),
    };
  }

  const outputPath = getParsedReplayOutputPath(replayPath);
  const startedAt = Date.now();
  const decodeResult = await runReplayParserPipeline({ replayPath, outputPath });
  const actualOutputPath = decodeResult.outputPath || outputPath;

  const { metrics, replayExtract, rawPreview, parseWarning } = analyzeJsonOutput(actualOutputPath);
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

  if (decodeResult.mode === 'partial') {
    return {
      replayId,
      fileName,
      replayPath,
      status: 'parcial',
      summary: `No se pudo hacer decode completo, pero se guardó una ficha parcial en ${elapsedSeconds}s. ${decodeResult.partialDetail || decodeResult.partialReason || 'Instalá rrrocket como fallback o probá con otra versión del parser.'}`,
      rattletrapPath: rattletrapStatus.executablePath,
      rrrocketPath: rattletrapStatus.rrrocketPath,
      parserUsed: 'partial',
      jsonPath: actualOutputPath,
      extractedMetrics: metrics,
      replayExtract,
      rawPreview,
      parserDiagnostics: decodeResult.failures?.slice(0, 8).map((failure, index) => ({
        attempt: index + 1,
        parser: failure.parser || 'unknown',
        problem: detectParserProblem(`${failure.stderr || ''}\n${failure.stdout || ''}\n${failure.message || ''}`),
        output: normalizeParserOutput(failure.stderr || failure.stdout || failure.message || ''),
      })) ?? [],
    };
  }

  return {
    replayId,
    fileName,
    replayPath,
    status: 'convertido',
    summary: parseWarning
      ? `Replay convertido a JSON en ${elapsedSeconds}s con ${decodeResult.parser}. ${parseWarning}`
      : `Replay convertido a JSON en ${elapsedSeconds}s con ${decodeResult.parser}. Se extrajo metadata inicial para preparar el motor de KPIs.`,
    rattletrapPath: rattletrapStatus.executablePath,
    rrrocketPath: rattletrapStatus.rrrocketPath,
    parserUsed: decodeResult.parser,
    jsonPath: actualOutputPath,
    extractedMetrics: metrics,
    replayExtract,
    rawPreview,
  };
});



