const fs = require('node:fs');
const path = require('node:path');

const project = process.argv[2] || process.cwd();
const touched = [];

function file(rel) {
  return path.join(project, rel);
}

function read(rel) {
  const p = file(rel);
  if (!fs.existsSync(p)) throw new Error(`No existe ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

function write(rel, content) {
  const p = file(rel);
  const backup = `${p}.bak48`;
  if (!fs.existsSync(backup)) fs.copyFileSync(p, backup);
  fs.writeFileSync(p, content, 'utf8');
  touched.push(rel);
}

function replaceOnce(content, needle, replacement, label) {
  if (!content.includes(needle)) throw new Error(`No encontré bloque: ${label}`);
  return content.replace(needle, replacement);
}

function ensureIncludes(content, snippet, insertAfter, label) {
  if (content.includes(snippet)) return content;
  if (!content.includes(insertAfter)) throw new Error(`No encontré punto de inserción: ${label}`);
  return content.replace(insertAfter, `${insertAfter}${snippet}`);
}

function patchApp() {
  const rel = 'src/App.tsx';
  let s = read(rel);

  s = ensureIncludes(
    s,
    "import { normalizePlaylistRanks } from './lib/rankSync';\n",
    "import { calculateDerivedMetrics } from './lib/calculations';\n",
    'App.tsx import normalizePlaylistRanks',
  );

  const helper = `\nfunction getDashboardRankSnapshot(store: RocketLeagueDataStore, modeFilter: ModeFilter): RocketLeagueDataStore['profile']['rank'] {\n  if (modeFilter === 'ALL') return store.profile.rank;\n\n  const playlistRank = normalizePlaylistRanks(store.playlistRanks).find((rank) => rank.playlist === modeFilter);\n  if (!playlistRank) return { ...store.profile.rank, playlist: modeFilter };\n\n  return {\n    ...store.profile.rank,\n    id: \`rank-dashboard-\${playlistRank.playlist}\`,\n    capturedAt: playlistRank.lastUpdatedAt || store.profile.rank.capturedAt || new Date(0).toISOString(),\n    playlist: playlistRank.playlist,\n    tier: playlistRank.tier || 'Sin rango',\n    division: playlistRank.division || 'Sin división',\n    mmr: Number(playlistRank.mmr) || 0,\n    mmrDelta: Number(playlistRank.mmrDelta) || 0,\n    gamesToNextRank: Number(playlistRank.gamesToNextRank) || 0,\n    progressToNextRank: Math.max(0, Math.min(100, Number(playlistRank.progressToNextRank) || 0)),\n    source: playlistRank.source,\n  };\n}\n`;

  if (!s.includes('function getDashboardRankSnapshot')) {
    s = replaceOnce(s, "type ModeFilter = Extract<GameMode, '1v1' | '2v2' | '3v3'> | 'ALL';\n", "type ModeFilter = Extract<GameMode, '1v1' | '2v2' | '3v3'> | 'ALL';\n" + helper, 'App.tsx helper after ModeFilter');
  }

  if (!s.includes('const dashboardRank = useMemo(() => getDashboardRankSnapshot(store, modeFilter), [store, modeFilter]);')) {
    s = replaceOnce(
      s,
      "  const filteredMatches = useMemo(() => {\n",
      "  const dashboardRank = useMemo(() => getDashboardRankSnapshot(store, modeFilter), [store, modeFilter]);\n\n  const filteredMatches = useMemo(() => {\n",
      'App.tsx dashboardRank useMemo',
    );
  }

  s = s.replace(
    "    profile: {\n      ...store.profile,\n      mainMode: modeFilter === 'ALL' ? store.profile.mainMode : modeFilter,\n    },\n  }), [filteredMatches, modeFilter, store]);",
    "    profile: {\n      ...store.profile,\n      mainMode: modeFilter === 'ALL' ? store.profile.mainMode : modeFilter,\n      rank: dashboardRank,\n    },\n  }), [dashboardRank, filteredMatches, modeFilter, store]);",
  );

  s = s.replace('      profile={store.profile}\n', '      profile={viewStore.profile}\n');

  write(rel, s);
}

function patchReplayMatchMapper() {
  const rel = 'src/lib/replayMatchMapper.ts';
  let s = read(rel);

  const helper = `\nfunction inferMatchTypeFromPlaylist(playlist: string): { matchType: RocketLeagueMatch['matchType']; tag: string; confidence: 'alta' | 'media' | 'baja'; note: string } {\n  const value = String(playlist || '').toLowerCase();\n\n  if (/private|custom|exhibition|lan|torneo|tournament/.test(value)) {\n    return { matchType: 'Private', tag: 'match-type:private', confidence: 'alta', note: 'Replay clasificado como privado/torneo por texto de playlist.' };\n  }\n\n  if (/ranked|competitive|competitivo|skill\\s*rating|mmr/.test(value)) {\n    return { matchType: 'Ranked', tag: 'match-type:ranked', confidence: 'alta', note: 'Replay clasificado como ranked por señal explícita en metadata.' };\n  }\n\n  if (/casual|unranked|online/.test(value)) {\n    return { matchType: 'Casual', tag: 'match-type:casual', confidence: value.includes('online') && !/casual|unranked/.test(value) ? 'baja' : 'media', note: value.includes('online') && !/casual|unranked/.test(value) ? 'Metadata solo dice Online; se marca Casual con baja confianza porque no hay señal Ranked.' : 'Replay clasificado como casual por metadata.' };\n  }\n\n  return { matchType: 'Replay Review', tag: 'match-type:unclassified', confidence: 'baja', note: 'No hay señal suficiente para distinguir casual/ranked desde el replay.' };\n}\n`;

  if (!s.includes('function inferMatchTypeFromPlaylist')) {
    s = replaceOnce(s, "function normalizeReplayDate(dateText: string): string {\n", `${helper}\nfunction normalizeReplayDate(dateText: string): string {\n`, 'replay mapper classification helper');
  }

  if (!s.includes('const matchClassification = inferMatchTypeFromPlaylist(extract.metadata.playlist);')) {
    s = replaceOnce(
      s,
      "  const mode = normalizeMode(extract.metadata.playlist, profile.mainMode);\n",
      "  const mode = normalizeMode(extract.metadata.playlist, profile.mainMode);\n  const matchClassification = inferMatchTypeFromPlaylist(extract.metadata.playlist);\n",
      'replay mapper matchClassification const',
    );
  }

  s = s.replace("    matchType: 'Replay Review',\n", "    matchType: matchClassification.matchType,\n");
  s = s.replace(
    "    notes: `Importado automáticamente desde replay. Parser: ${analysis.parserUsed ?? 'rattletrap'}. JSON: ${analysis.jsonPath ?? 'sin ruta'}.`,\n",
    "    notes: `Importado automáticamente desde replay. ${matchClassification.note} Parser: ${analysis.parserUsed ?? 'rattletrap'}. JSON: ${analysis.jsonPath ?? 'sin ruta'}.`,\n",
  );
  s = s.replace(
    "    tags: Array.from(new Set(['replay', 'auto-import', extract.metadata.schema || 'rattletrap', extract.metadata.matchGuid ? `match:${extract.metadata.matchGuid}` : '', extract.metadata.replayId ? `replay:${extract.metadata.replayId}` : ''].filter(Boolean))),\n",
    "    tags: Array.from(new Set(['replay', 'auto-import', matchClassification.tag, `classification:${matchClassification.confidence}`, extract.metadata.schema || 'rattletrap', extract.metadata.matchGuid ? `match:${extract.metadata.matchGuid}` : '', extract.metadata.replayId ? `replay:${extract.metadata.replayId}` : ''].filter(Boolean))),\n",
  );

  write(rel, s);
}

function patchMmrOcrHub() {
  const rel = 'src/components/rocket-league/MmrOcrHub.tsx';
  let s = read(rel);

  s = s.replace("import { useMemo, useState } from 'react';", "import { useMemo, useState } from 'react';");

  const oldBlock = "  const ocr = { enabled: false, autoPromptAfterMatch: true, playlist: settings.mainPlaylistFilter === '1v1' || settings.mainPlaylistFilter === '2v2' || settings.mainPlaylistFilter === '3v3' ? settings.mainPlaylistFilter : '2v2', roi: DEFAULT_ROI, status: 'sin_configurar' as const, ...(settings.mmrOcr ?? {}) };\n  const [status, setStatus] = useState<MmrOcrStatus | null>(null);\n  const [capture, setCapture] = useState<MmrScreenCapture | null>(null);\n  const [playlist, setPlaylist] = useState<RankedPlaylist>((ocr.playlist === '1v1' || ocr.playlist === '2v2' || ocr.playlist === '3v3') ? ocr.playlist : '2v2');\n  const [mmr, setMmr] = useState(String(ocr.lastConfirmedMmr || ''));\n  const [tier, setTier] = useState('Sin rango');\n  const [division, setDivision] = useState('Sin división');\n  const [roi, setRoi] = useState(ocr.roi ?? DEFAULT_ROI);\n  const [feedback, setFeedback] = useState('');\n\n  const currentRank = useMemo(() => playlistRanks.find((rank) => rank.playlist === playlist), [playlistRanks, playlist]);\n";
  const newBlock = "  const ocr = { enabled: false, autoPromptAfterMatch: true, playlist: settings.mainPlaylistFilter === '1v1' || settings.mainPlaylistFilter === '2v2' || settings.mainPlaylistFilter === '3v3' ? settings.mainPlaylistFilter : '2v2', roi: DEFAULT_ROI, status: 'sin_configurar' as const, ...(settings.mmrOcr ?? {}) };\n  const initialPlaylist: RankedPlaylist = (ocr.playlist === '1v1' || ocr.playlist === '2v2' || ocr.playlist === '3v3') ? ocr.playlist : '2v2';\n  const initialRank = playlistRanks.find((rank) => rank.playlist === initialPlaylist);\n  const [status, setStatus] = useState<MmrOcrStatus | null>(null);\n  const [capture, setCapture] = useState<MmrScreenCapture | null>(null);\n  const [playlist, setPlaylist] = useState<RankedPlaylist>(initialPlaylist);\n  const [mmr, setMmr] = useState(String(ocr.lastConfirmedMmr || initialRank?.mmr || ''));\n  const [tier, setTier] = useState(initialRank?.tier || 'Sin rango');\n  const [division, setDivision] = useState(initialRank?.division || 'Sin división');\n  const [roi, setRoi] = useState(ocr.roi ?? DEFAULT_ROI);\n  const [feedback, setFeedback] = useState('');\n\n  const currentRank = useMemo(() => playlistRanks.find((rank) => rank.playlist === playlist), [playlistRanks, playlist]);\n\n  function loadPlaylist(nextPlaylist: RankedPlaylist) {\n    const nextRank = playlistRanks.find((rank) => rank.playlist === nextPlaylist);\n    setPlaylist(nextPlaylist);\n    setMmr(nextRank?.mmr ? String(nextRank.mmr) : '');\n    setTier(nextRank?.tier || 'Sin rango');\n    setDivision(nextRank?.division || 'Sin división');\n    onSaveSettings({ mmrOcr: { ...ocr, playlist: nextPlaylist, roi, status: ocr.status } });\n  }\n";
  s = replaceOnce(s, oldBlock, newBlock, 'MmrOcrHub initial rank block');

  s = s.replace(
    "<label><span>Playlist</span><select value={playlist} onChange={(event) => setPlaylist(event.target.value as RankedPlaylist)}>{PLAYLISTS.map((mode) => <option key={mode}>{mode}</option>)}</select></label>",
    "<label><span>Playlist</span><select value={playlist} onChange={(event) => loadPlaylist(event.target.value as RankedPlaylist)}>{PLAYLISTS.map((mode) => <option key={mode}>{mode}</option>)}</select></label>",
  );

  write(rel, s);
}

function patchMainCapture() {
  const rel = 'electron/main.cjs';
  let s = read(rel);
  if (s.includes('Phase 48: hide app window before OCR screen capture')) {
    write(rel, s);
    return;
  }
  const re = /async function capturePrimaryDisplayForOcr\(\) \{[\s\S]*?\n\}\n\nfunction saveMmrOcrSample/;
  const replacement = [
    'async function capturePrimaryDisplayForOcr() {',
    '  let shouldRestoreWindow = false;',
    '  let wasMinimized = false;',
    '',
    '  try {',
    '    // Phase 48: hide app window before OCR screen capture so the capture sees Rocket League, not RLA.',
    '    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {',
    '      shouldRestoreWindow = true;',
    '      wasMinimized = mainWindow.isMinimized();',
    '      mainWindow.hide();',
    '      await new Promise((resolve) => setTimeout(resolve, 850));',
    '    }',
    '',
    '    const sources = await desktopCapturer.getSources({',
    "      types: ['screen'],",
    '      thumbnailSize: { width: 1920, height: 1080 },',
    '      fetchWindowIcons: false,',
    '    });',
    '    const source = sources[0];',
    '    if (!source || source.thumbnail.isEmpty()) {',
    "      return { ok: false, message: 'No se pudo capturar la pantalla. Probá con Rocket League en modo ventana sin bordes y dejalo visible detrás de RLA.', dataUrl: '', width: 0, height: 0, capturedAt: new Date().toISOString() };",
    '    }',
    '    const dataUrl = source.thumbnail.toDataURL();',
    '    const size = source.thumbnail.getSize();',
    '    const capturedAt = new Date().toISOString();',
    "    const capturesDirectory = path.join(ensureMmrOcrDirectory(), 'captures');",
    "    const filePath = path.join(capturesDirectory, `mmr-capture-${Date.now()}.png`);",
    "    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');",
    "    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));",
    "    return { ok: true, message: 'Captura local guardada. RLA se ocultó brevemente; dejá Rocket League visible detrás para que la muestra sea del juego.', dataUrl, width: size.width, height: size.height, capturedAt, filePath };",
    '  } catch (error) {',
    "    return { ok: false, message: error instanceof Error ? error.message : 'Error al capturar pantalla.', dataUrl: '', width: 0, height: 0, capturedAt: new Date().toISOString() };",
    '  } finally {',
    '    if (shouldRestoreWindow && mainWindow && !mainWindow.isDestroyed()) {',
    '      if (wasMinimized) mainWindow.minimize();',
    '      else {',
    '        mainWindow.show();',
    '        mainWindow.focus();',
    '      }',
    '    }',
    '  }',
    '}',
    '',
    'function saveMmrOcrSample',
  ].join('\n');
  if (!re.test(s)) throw new Error('No encontré capturePrimaryDisplayForOcr en electron/main.cjs');
  s = s.replace(re, replacement);
  // Fix escaped backticks inserted above for template literal in JS file.
  s = s.replace(/\\`/g, '`').replace(/\\\$/g, '$');
  write(rel, s);
}

function main() {
  patchApp();
  patchReplayMatchMapper();
  patchMmrOcrHub();
  patchMainCapture();
  console.log('Phase 48 aplicado. Archivos tocados:');
  for (const rel of touched) console.log(`- ${rel}`);
  console.log('Backups .bak48 creados junto a cada archivo modificado.');
}

main();
