import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../cards/EmptyState';
import { MetricCard } from '../cards/MetricCard';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import {
  analyzeReplayPreview,
  getDefaultReplayDirectory,
  getRattletrapStatus,
  isElectronRuntime,
  listenReplayFileDetected,
  listenReplayWatcherError,
  openParsedReplayFolder,
  scanReplayFolder,
  selectRattletrapExecutable,
  selectRrrocketExecutable,
  selectReplayDirectory,
  startReplayWatcher,
  stopReplayWatcher,
  type DesktopReplayFile,
  type RattletrapStatus,
  type ReplayAnalysisPreview,
  type ReplayWatcherStatus,
} from '../../lib/electronBridge';
import { buildMatchFromReplayAnalysis } from '../../lib/replayMatchMapper';
import type { PlayerProfile, RocketLeagueMatch, RocketLeagueSettings } from '../../types/rocketLeague';
import { getTrackerAutomationSettings } from './trackerNetworkAutoSync';

const initialStatus: ReplayWatcherStatus = {
  isDesktop: false,
  isWatching: false,
  replayDirectory: '%USERPROFILE%\\Documents\\My Games\\Rocket League\\TAGame\\DemosEpic',
  lastMessage: 'Esperando app de escritorio',
  detectedFiles: 0,
};

const initialParserStatus: RattletrapStatus = {
  isAvailable: false,
  executablePath: 'vendor\\rattletrap\\rattletrap.exe',
  bundledPath: 'vendor\\rattletrap\\rattletrap.exe',
  source: 'vendor',
  message: 'Parser pendiente.',
  rattletrapAvailable: false,
  rattletrapPath: 'vendor\\rattletrap\\rattletrap.exe',
  rattletrapSource: 'vendor',
  rrrocketAvailable: false,
  rrrocketPath: 'vendor\\rrrocket\\rrrocket.exe',
  rrrocketSource: 'vendor',
  activeParser: 'none',
};

type ReplayConnectorProps = {
  profile: PlayerProfile;
  settings?: RocketLeagueSettings;
  matches: RocketLeagueMatch[];
  onUpdateSettings?: (settings: Partial<RocketLeagueSettings>) => void;
  onCreateMatch: (match: RocketLeagueMatch) => void;
  onOpenMatch: (matchId: string) => void;
};

export function ReplayConnector({ profile, settings, matches, onUpdateSettings, onCreateMatch, onOpenMatch }: ReplayConnectorProps) {
  const [isDesktop] = useState(() => isElectronRuntime());
  const [status, setStatus] = useState<ReplayWatcherStatus>(initialStatus);
  const [parserStatus, setParserStatus] = useState<RattletrapStatus>(initialParserStatus);
  const [files, setFiles] = useState<DesktopReplayFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState('');
  const [analysis, setAnalysis] = useState<ReplayAnalysisPreview | null>(null);
  const [parsedCount, setParsedCount] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdMatchId, setCreatedMatchId] = useState('');
  const [batchProgress, setBatchProgress] = useState<{ total: number; processed: number; created: number; skipped: number; failed: number; currentFileName?: string } | null>(null);
  const automationSettings = settings ? getTrackerAutomationSettings(settings) : null;

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId],
  );

  const analysisBelongsToSelectedFile = Boolean(
    analysis && selectedFile && (
      analysis.replayPath === selectedFile.path ||
      analysis.replayId === selectedFile.id ||
      analysis.fileName === selectedFile.fileName
    ),
  );
  const visibleAnalysis = analysisBelongsToSelectedFile ? analysis : null;
  const hasConvertedReplay = visibleAnalysis?.status === 'convertido' || visibleAnalysis?.status === 'analizado';
  const hasProcessedReplay = hasConvertedReplay || visibleAnalysis?.status === 'parcial';

  const generatedMatch = useMemo(
    () => (visibleAnalysis ? buildMatchFromReplayAnalysis(visibleAnalysis, profile) : null),
    [visibleAnalysis, profile],
  );

  const storedReplayMatch = useMemo(() => {
    if (!generatedMatch) return null;
    return matches.find((match) => match.id === generatedMatch.id || match.replayId === generatedMatch.replayId || match.replayJsonPath === generatedMatch.replayJsonPath) ?? null;
  }, [generatedMatch, matches]);

  const registeredReplayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const match of matches) {
      if (match.replayId) keys.add(match.replayId);
      if (match.replayPath) keys.add(match.replayPath);
      if (match.replayFileName) keys.add(match.replayFileName);
      if (match.replayJsonPath) keys.add(match.replayJsonPath);
    }
    return keys;
  }, [matches]);

  const pendingReplayFiles = useMemo(
    () => files.filter((file) => !registeredReplayKeys.has(file.id) && !registeredReplayKeys.has(file.path) && !registeredReplayKeys.has(file.fileName) && file.status !== 'convertido' && file.status !== 'analizado'),
    [files, registeredReplayKeys],
  );

  function isReplayAlreadyRegistered(file: DesktopReplayFile, preview?: ReplayAnalysisPreview) {
    if (registeredReplayKeys.has(file.id) || registeredReplayKeys.has(file.path) || registeredReplayKeys.has(file.fileName)) return true;
    if (!preview) return false;
    return Boolean(
      registeredReplayKeys.has(preview.replayId) ||
      (preview.replayPath && registeredReplayKeys.has(preview.replayPath)) ||
      (preview.fileName && registeredReplayKeys.has(preview.fileName)) ||
      (preview.jsonPath && registeredReplayKeys.has(preview.jsonPath)),
    );
  }


  function createReplayFallbackMatch(file: DesktopReplayFile, preview?: ReplayAnalysisPreview | null): RocketLeagueMatch {
    const playedAt = file.modifiedAt || new Date().toISOString();
    const replaySource = preview?.replayId || file.id || file.path || file.fileName;
    const cleanSource = replaySource.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72) || `${Date.now()}`;
    const matchId = `match-replay-fallback-${cleanSource}`;
    const rankSnapshot = {
      ...profile.rank,
      id: `rank-replay-fallback-${cleanSource}`,
      capturedAt: playedAt,
      playlist: profile.mainMode,
      mmrDelta: 0,
      source: 'replay_parser' as const,
    };

    return {
      id: matchId,
      playedAt,
      mapName: preview?.replayExtract?.metadata.mapName || 'Replay importado',
      mode: profile.mainMode,
      playlist: preview?.replayExtract?.metadata.playlist || profile.mainMode,
      matchType: 'Replay Review',
      result: 'sin_registro',
      teamColor: 'neutral',
      durationSeconds: preview?.replayExtract?.metadata.durationSeconds || 0,
      score: {
        blue: preview?.replayExtract?.score.blue || 0,
        orange: preview?.replayExtract?.score.orange || 0,
      },
      playerStats: {
        goals: 0,
        assists: 0,
        saves: 0,
        shots: 0,
        demos: 0,
        score: 0,
      },
      performance: {
        avgSpeed: 0,
        boostCollected: 0,
        boostWasted: 0,
        shootingAccuracy: 0,
        possessionPressure: 0,
        defensiveErrors: 0,
        overcommitCount: 0,
      },
      rankSnapshot,
      mmrBefore: profile.rank.mmr,
      mmrAfter: profile.rank.mmr,
      events: [],
      players: [],
      personalMetrics: {
        movement: 0,
        boost: 0,
        offence: 0,
        defence: 0,
        rotation: 0,
        positioning: 0,
      },
      quickObservation: 'Replay registrado como placeholder porque el parser no extrajo jugadores/estadísticas suficientes.',
      mainErrorId: 'replay-placeholder',
      mainErrorTitle: 'Replay pendiente de análisis profundo',
      affectedAreaId: 'positioning',
      recommendedFocusAreaId: 'positioning',
      recommendedFocus: 'Abrir esta replay y revisar manualmente el primer gol concedido o el tiro fallado más claro.',
      lesson: 'La replay ya quedó en el historial para no perderla, pero falta telemetría suficiente para diagnóstico automático completo.',
      nextTrainingAction: 'Procesar con extractor profundo o capturar Stats API live para convertirla en candidatos de entrenamiento más precisos.',
      notes: `Importado en lote desde replay local. Estado extractor: ${preview?.status || 'sin_preview'}. JSON: ${preview?.jsonPath || 'no generado'}.`,
      tags: Array.from(new Set(['replay', 'auto-import', 'bulk-import', 'placeholder', preview?.parserUsed || '', preview?.status || ''].filter(Boolean))),
      source: 'replay_parser',
      replayId: preview?.replayId || file.id,
      replayFileName: file.fileName,
      replayPath: file.path,
      replayJsonPath: preview?.jsonPath,
      parserUsed: preview?.parserUsed || 'partial',
      importedAt: new Date().toISOString(),
    };
  }

  useEffect(() => {
    if (!isElectronRuntime()) return;

    void getDefaultReplayDirectory()
      .then((path) => setStatus((current) => ({ ...current, isDesktop: true, replayDirectory: path, lastMessage: 'Carpeta local preparada' })))
      .catch(() => setStatus((current) => ({ ...current, isDesktop: true, lastMessage: 'No se pudo resolver la carpeta por defecto' })));

    void refreshParserStatus();

    const unlistenDetected = listenReplayFileDetected((file) => {
      setFiles((current) => {
        if (current.some((item) => item.path === file.path)) return current;
        return [file, ...current];
      });
      setSelectedFileId((current) => current || file.id);
      setStatus((current) => ({ ...current, detectedFiles: current.detectedFiles + 1, lastMessage: `Replay detectado: ${file.fileName}` }));
    });

    const unlistenError = listenReplayWatcherError((payload) => {
      setStatus((current) => ({ ...current, isWatching: false, lastMessage: payload.message }));
      setFeedback(payload.message);
    });

    return () => {
      unlistenDetected();
      unlistenError();
    };
  }, []);

  async function refreshParserStatus() {
    if (!isElectronRuntime()) return;
    try {
      const nextStatus = await getRattletrapStatus();
      setParserStatus(nextStatus);
      if (!nextStatus.isAvailable) setFeedback(nextStatus.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo revisar Rattletrap.');
    }
  }

  async function handleSelectReplayDirectory() {
    setBusy(true);
    setFeedback('Seleccioná la carpeta donde Rocket League guarda tus replays.');
    try {
      const nextStatus = await selectReplayDirectory();
      setStatus(nextStatus);
      const replayFiles = await scanReplayFolder();
      setFiles(replayFiles);
      setSelectedFileId(replayFiles[0]?.id ?? '');
      setAnalysis(null);
      setFeedback(`${nextStatus.lastMessage}. Replays encontrados: ${replayFiles.length}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo cambiar la carpeta de replays.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectRattletrapExecutable() {
    setBusy(true);
    setFeedback('Seleccioná rattletrap.exe para activar conversión real a JSON.');
    try {
      const nextStatus = await selectRattletrapExecutable();
      setParserStatus(nextStatus);
      setFeedback(nextStatus.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo seleccionar rattletrap.exe.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectRrrocketExecutable() {
    setBusy(true);
    setFeedback('Seleccioná rrrocket.exe como parser alternativo si Rattletrap falla con MissingClassName.');
    try {
      const nextStatus = await selectRrrocketExecutable();
      setParserStatus(nextStatus);
      setFeedback(nextStatus.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo seleccionar rrrocket.exe.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenParsedFolder() {
    setBusy(true);
    try {
      const folderPath = await openParsedReplayFolder();
      setFeedback(`Carpeta de JSON procesados abierta: ${folderPath}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo abrir la carpeta de JSON.');
    } finally {
      setBusy(false);
    }
  }

  async function handleScanFolder() {
    setBusy(true);
    setFeedback('Escaneando carpeta local...');
    try {
      const replayFiles = await scanReplayFolder();
      setFiles(replayFiles);
      setSelectedFileId((current) => (current && replayFiles.some((file) => file.id === current) ? current : replayFiles[0]?.id || ''));
      setAnalysis(null);
      setCreatedMatchId('');
      setStatus((current) => ({ ...current, detectedFiles: replayFiles.length, lastMessage: replayFiles.length ? 'Replays encontrados' : 'Sin replays detectados' }));
      setFeedback(replayFiles.length ? `${replayFiles.length} replays detectados.` : 'No se encontraron archivos .replay en la carpeta objetivo.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo escanear la carpeta local.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartWatcher() {
    setBusy(true);
    setFeedback('Activando watcher local...');
    try {
      const watcherStatus = await startReplayWatcher();
      setStatus(watcherStatus);
      onUpdateSettings?.({
        replayWatcherWasActive: watcherStatus.isWatching,
        autoParseNewReplays: automationSettings?.autoParseNewReplays ?? watcherStatus.isWatching,
        updatedAt: new Date().toISOString(),
      } as Partial<RocketLeagueSettings>);
      setFeedback(watcherStatus.lastMessage);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo activar el watcher.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStopWatcher() {
    setBusy(true);
    try {
      const watcherStatus = await stopReplayWatcher();
      setStatus(watcherStatus);
      onUpdateSettings?.({
        replayWatcherWasActive: false,
        updatedAt: new Date().toISOString(),
      } as Partial<RocketLeagueSettings>);
      setFeedback(watcherStatus.lastMessage);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo detener el watcher.');
    } finally {
      setBusy(false);
    }
  }

  function handleSelectReplayFile(file: DesktopReplayFile) {
    setSelectedFileId(file.id);
    setAnalysis(null);
    setCreatedMatchId('');
    setFeedback(`Replay seleccionado: ${file.fileName}. Presioná Procesar replay para convertirlo o crear su partida.`);
  }

  async function handleAnalyzeSelectedReplay() {
    if (!selectedFile) {
      setFeedback('Seleccioná un replay primero.');
      return;
    }

    setBusy(true);
    setAnalysis(null);
    setFeedback(`Convirtiendo ${selectedFile.fileName} a JSON local...`);
    try {
      const preview = await analyzeReplayPreview(selectedFile.path);
      setAnalysis(preview);
      setCreatedMatchId('');
      setFeedback(preview.summary);
      if (preview.status === 'convertido' || preview.status === 'analizado') setParsedCount((current) => current + 1);
      setFiles((current) => current.map((file) => (file.path === selectedFile.path ? { ...file, status: preview.status === 'parcial' ? 'parcial' : preview.status === 'error' ? 'error' : 'convertido' } : file)));
      void refreshParserStatus();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo preparar el análisis del replay.');
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessAllReplays() {
    if (!files.length) {
      setFeedback('Primero escaneá DemosEpic para encontrar replays.');
      return;
    }

    const candidates = files.filter((file) => !isReplayAlreadyRegistered(file));
    if (!candidates.length) {
      setFeedback('No hay replays pendientes: las detectadas ya están registradas o marcadas como procesadas.');
      return;
    }

    setBusy(true);
    setAnalysis(null);
    setCreatedMatchId('');
    setBatchProgress({ total: candidates.length, processed: 0, created: 0, skipped: 0, failed: 0 });
    setFeedback(`Procesando ${candidates.length} replays en lote. Si el extractor no tiene datos suficientes, se creará una partida placeholder para no perder la replay.`);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    let lastPreview: ReplayAnalysisPreview | null = null;
    let lastCreatedMatchId = '';

    for (let index = 0; index < candidates.length; index += 1) {
      const file = candidates[index];
      setSelectedFileId(file.id);
      setBatchProgress({ total: candidates.length, processed: index, created, skipped, failed, currentFileName: file.fileName });
      setFiles((current) => current.map((item) => (item.path === file.path ? { ...item, status: 'analizando' } : item)));
      setFeedback(`Procesando y creando partida ${index + 1}/${candidates.length}: ${file.fileName}`);

      try {
        const preview = await analyzeReplayPreview(file.path);
        lastPreview = preview;
        const nextStatus = preview.status === 'parcial' ? 'parcial' : preview.status === 'error' ? 'error' : 'convertido';
        setFiles((current) => current.map((item) => (item.path === file.path ? { ...item, status: nextStatus } : item)));
        if (preview.status === 'convertido' || preview.status === 'analizado') setParsedCount((current) => current + 1);

        if (isReplayAlreadyRegistered(file, preview)) {
          skipped += 1;
          continue;
        }

        const nextMatch = buildMatchFromReplayAnalysis(preview, profile) ?? createReplayFallbackMatch(file, preview);

        onCreateMatch(nextMatch);
        lastCreatedMatchId = nextMatch.id;
        created += 1;
      } catch (error) {
        failed += 1;
        setFiles((current) => current.map((item) => (item.path === file.path ? { ...item, status: 'error' } : item)));
      } finally {
        setBatchProgress({ total: candidates.length, processed: index + 1, created, skipped, failed, currentFileName: file.fileName });
      }
    }

    if (lastPreview) setAnalysis(lastPreview);
    setCreatedMatchId(lastCreatedMatchId);
    setBatchProgress({ total: candidates.length, processed: candidates.length, created, skipped, failed });
    setFeedback(`Lote terminado: ${created} partidas creadas en Match History, ${skipped} omitidas, ${failed} con error. Las partidas placeholder quedan marcadas como pendientes de análisis profundo.`);
    void refreshParserStatus();
    setBusy(false);
  }

  function handleCreateMatchFromReplay() {
    if (!generatedMatch) {
      setFeedback('El extractor todavía no tiene datos suficientes para crear una partida automática.');
      return;
    }

    onCreateMatch(generatedMatch);
    setCreatedMatchId(generatedMatch.id);
    setFeedback(`Partida creada en historial: ${generatedMatch.mapName} · ${generatedMatch.score.blue}-${generatedMatch.score.orange}.`);
  }

  function handleOpenCreatedMatch() {
    const matchId = storedReplayMatch?.id ?? createdMatchId;
    if (!matchId) return;
    onOpenMatch(matchId);
  }

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-[1.75rem] border border-cyan-300/14 bg-slate-950/75 shadow-2xl shadow-black/30">
        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_390px]">
          <div className="rounded-[1.45rem] border border-white/10 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.18),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.74))] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={isDesktop ? 'improvement' : 'warning'} dot>{isDesktop ? 'Modo escritorio' : 'Solo vista web'}</StatusBadge>
              <StatusBadge tone={status.isWatching ? 'info' : 'neutral'}>{status.isWatching ? 'Watcher activo' : 'Awaiting replay'}</StatusBadge>
              <StatusBadge tone={parserStatus.isAvailable ? 'improvement' : 'warning'}>{parserStatus.isAvailable ? `Parser listo: ${parserStatus.activeParser === 'rrrocket' ? 'rrrocket' : 'Rattletrap'}` : 'Parser pendiente'}</StatusBadge>
              <StatusBadge tone={automationSettings?.autoParseNewReplays ? 'improvement' : 'neutral'}>{automationSettings?.autoParseNewReplays ? 'Auto-parse ON' : 'Auto-parse OFF'}</StatusBadge>
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-5xl">Replay Intake</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-400">
              Esta pantalla conecta la app con tus replays locales. Ahora puede detectar archivos, convertirlos a JSON con Rattletrap y preparar el extractor de KPIs.
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Carpeta objetivo</p>
              <p className="mt-2 break-all font-mono text-xs font-bold text-cyan-100">{status.replayDirectory}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleSelectReplayDirectory} disabled={!isDesktop || busy} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-50 disabled:opacity-45">
                  Cambiar carpeta
                </button>
                <button onClick={handleScanFolder} disabled={!isDesktop || busy} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-200 disabled:opacity-45">
                  Escanear
                </button>
              </div>
            </div>
          </div>

          <aside className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Estado del sistema</p>
            <h2 className="mt-2 text-2xl font-black text-white">{status.lastMessage}</h2>
            <div className="mt-4 grid gap-2">
              <ControlRow label="Runtime" value={isDesktop ? 'Desktop/Electron' : 'GitHub Pages'} />
              <ControlRow label="Replays detectados" value={status.detectedFiles.toString()} />
              <ControlRow label="Parser real" value={parserStatus.isAvailable ? 'Disponible' : 'Pendiente'} />
              <ControlRow label="Rattletrap" value={parserStatus.rattletrapAvailable ? 'Listo' : 'No detectado'} />
              <ControlRow label="rrrocket" value={parserStatus.rrrocketAvailable ? 'Listo' : 'Opcional'} />
            </div>
            {feedback ? <p className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-xs font-semibold text-cyan-50">{feedback}</p> : null}
          </aside>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Replays locales" value={files.length} helper="Archivos .replay detectados" tone="cyan" />
        <MetricCard label="Pendientes" value={pendingReplayFiles.length} helper="Listas para procesar en lote" tone={pendingReplayFiles.length ? 'orange' : 'emerald'} />
        <MetricCard label="Watcher" value={status.isWatching ? 'On' : 'Off'} helper="Vigilancia de carpeta" tone={status.isWatching ? 'emerald' : 'slate'} />
        <MetricCard label="JSON reales" value={parsedCount} helper={hasProcessedReplay && !hasConvertedReplay ? 'Ficha parcial guardada' : 'Convertidos en esta sesión'} tone={hasConvertedReplay ? 'emerald' : hasProcessedReplay ? 'orange' : 'slate'} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Control local</p>
              <h2 className="mt-1 text-xl font-black text-white">Conexión con replays</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleStartWatcher} disabled={!isDesktop || busy || status.isWatching} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 disabled:cursor-not-allowed disabled:opacity-45">
                Start watcher
              </button>
              <button onClick={handleStopWatcher} disabled={!isDesktop || busy || !status.isWatching} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-45">
                Stop
              </button>
            </div>
          </div>

          {!isDesktop ? (
            <div className="mt-5">
              <EmptyState title="Necesita app de escritorio" description="GitHub Pages no puede leer tus archivos locales ni vigilar la carpeta de Rocket League. Esta sección se activa al correr la app con Electron." />
            </div>
          ) : null}

          {isDesktop && !files.length ? (
            <div className="mt-5">
              <EmptyState title="Sin replays detectados" description="Presioná Escanear, elegí la carpeta correcta o activá el watcher antes de guardar una repetición nueva." />
            </div>
          ) : null}

          {files.length ? (
            <div className="mt-5 grid gap-2">
              {files.slice(0, 14).map((file) => (
                <button
                  key={file.id}
                  onClick={() => handleSelectReplayFile(file)}
                  className={`rounded-2xl border p-3 text-left transition ${selectedFile?.id === file.id ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.045]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{file.fileName}</p>
                      <p className="mt-1 break-all text-xs font-semibold text-slate-500">{file.path}</p>
                    </div>
                    <Tag>{file.status}</Tag>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Análisis local</p>
              <h2 className="mt-1 text-xl font-black text-white">Pipeline de replay</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={refreshParserStatus} disabled={!isDesktop || busy} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-200 disabled:cursor-not-allowed disabled:opacity-45">
                Comprobar parser
              </button>
              <button onClick={handleSelectRattletrapExecutable} disabled={!isDesktop || busy} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 disabled:cursor-not-allowed disabled:opacity-45">
                Rattletrap exe
              </button>
              <button onClick={handleSelectRrrocketExecutable} disabled={!isDesktop || busy} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 disabled:cursor-not-allowed disabled:opacity-45">
                rrrocket exe
              </button>
              <button onClick={handleAnalyzeSelectedReplay} disabled={!isDesktop || !selectedFile || busy} className="rounded-2xl border border-violet-300/30 bg-violet-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-violet-50 disabled:cursor-not-allowed disabled:opacity-45">
                Procesar replay
              </button>
              <button onClick={handleProcessAllReplays} disabled={!isDesktop || !files.length || busy} title="Procesa todas las replays pendientes y crea partidas automáticamente en Match History" className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 disabled:cursor-not-allowed disabled:opacity-45">
                Procesar todo + crear partidas
              </button>
              <button onClick={handleProcessAllReplays} disabled={!isDesktop || !files.length || busy} title="Forza el registro de todas las replays locales: si falta estadística, crea placeholder en Match History" className="rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-rose-50 disabled:cursor-not-allowed disabled:opacity-45">
                Forzar crear TODAS
              </button>
              <button onClick={handleProcessAllReplays} disabled={!isDesktop || !pendingReplayFiles.length || busy} title="Mismo flujo: convierte cada replay pendiente y registra su partida si hay datos suficientes" className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 disabled:cursor-not-allowed disabled:opacity-45">
                Crear partidas para todo
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Parsers locales</p>
            <p className="mt-2 break-all font-mono text-xs font-bold text-slate-300">Rattletrap: {parserStatus.rattletrapPath ?? parserStatus.executablePath}</p>
            <p className="mt-1 break-all font-mono text-xs font-bold text-slate-300">rrrocket: {parserStatus.rrrocketPath ?? 'vendor\\rrrocket\\rrrocket.exe'}</p>
            <p className={`mt-2 text-xs font-bold ${parserStatus.isAvailable ? 'text-emerald-200' : 'text-amber-200'}`}>{parserStatus.message}</p>
          </div>

          <div className="mt-3 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3 text-xs font-semibold leading-5 text-cyan-50/80">
            <span className="font-black text-cyan-100">Crear partidas para todo</span> usa el mismo flujo masivo: convierte cada .replay pendiente, genera el JSON y registra la partida automáticamente en Match History cuando el extractor tiene datos suficientes.
          </div>

          {batchProgress ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-100">
                <span>Procesamiento masivo</span>
                <span>{batchProgress.processed}/{batchProgress.total}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-emerald-300" style={{ width: `${batchProgress.total ? Math.round((batchProgress.processed / batchProgress.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 break-all text-xs font-semibold text-slate-300">{batchProgress.currentFileName ? `Actual: ${batchProgress.currentFileName}` : 'Lote listo.'}</p>
              <p className="mt-2 text-xs font-bold text-slate-400">Creadas: {batchProgress.created} · Omitidas: {batchProgress.skipped} · Errores: {batchProgress.failed}</p>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            <PipelineStep title="1. Detectar .replay" state={files.length ? 'listo' : 'pendiente'} />
            <PipelineStep title="2. Localizar parser" state={parserStatus.isAvailable ? 'listo' : 'pendiente'} detail="Usa Rattletrap primero. Si falla por MissingClassName, podés agregar rrrocket como fallback." />
            <PipelineStep title="3. Procesar replay" state={hasProcessedReplay ? 'listo' : 'pendiente'} detail="Convierte a JSON si el parser lo soporta; si no, guarda una ficha parcial con diagnóstico del fallo." />
            <PipelineStep title="4. Extractor básico" state={visibleAnalysis?.replayExtract ? 'listo' : 'pendiente'} detail="Lee el JSON y saca metadata, jugadores candidatos, marcador y eventos detectables." />
            <PipelineStep title="5. Crear partida automática" state={storedReplayMatch || createdMatchId ? 'listo' : generatedMatch ? 'pendiente' : 'pendiente'} detail="Convierte el JSON extraído en una partida usable por Historial, Dashboard y Game Analysis." />
          </div>

          {visibleAnalysis ? (
            <div className="mt-5 rounded-[1.25rem] border border-violet-300/15 bg-violet-300/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={visibleAnalysis.status === 'convertido' || visibleAnalysis.status === 'analizado' ? 'improvement' : visibleAnalysis.status === 'parcial' ? 'warning' : visibleAnalysis.status === 'error' ? 'decline' : 'warning'}>{visibleAnalysis.status}</StatusBadge>
                <Tag>{visibleAnalysis.fileName}</Tag>
                {visibleAnalysis.parserUsed ? <Tag>{visibleAnalysis.parserUsed}</Tag> : null}
                {visibleAnalysis.replayExtract?.metadata.schema ? <Tag>{visibleAnalysis.replayExtract.metadata.schema}</Tag> : null}
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">{visibleAnalysis.summary}</p>
              {visibleAnalysis.jsonPath ? <p className="mt-3 break-all rounded-2xl border border-white/10 bg-black/20 p-3 font-mono text-xs font-bold text-slate-400">{visibleAnalysis.jsonPath}</p> : null}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniKpi label="Goles" value={visibleAnalysis.extractedMetrics.goals} />
                <MiniKpi label="Tiros" value={visibleAnalysis.extractedMetrics.shots} />
                <MiniKpi label="Jugadores" value={visibleAnalysis.extractedMetrics.playerCount ?? 0} />
                <MiniKpi label="Eventos" value={visibleAnalysis.replayExtract?.events.length ?? 0} />
              </div>

              {visibleAnalysis.replayExtract ? <ReplayExtractPanel analysis={visibleAnalysis} /> : null}

              {visibleAnalysis.extractedMetrics.topLevelKeys?.length ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Claves raíz detectadas</p>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{visibleAnalysis.extractedMetrics.topLevelKeys.join(' · ')}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={handleOpenParsedFolder} disabled={busy} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-200 disabled:opacity-45">
                  Abrir carpeta JSON
                </button>
                <button onClick={handleCreateMatchFromReplay} disabled={busy || !generatedMatch || Boolean(storedReplayMatch)} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 disabled:cursor-not-allowed disabled:opacity-45">
                  {storedReplayMatch ? 'Partida ya registrada' : 'Crear partida'}
                </button>
                <button onClick={handleOpenCreatedMatch} disabled={busy || (!storedReplayMatch && !createdMatchId)} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 disabled:cursor-not-allowed disabled:opacity-45">
                  Ver en partidas
                </button>
              </div>
              {generatedMatch ? <ReplayMatchPreview match={generatedMatch} isStored={Boolean(storedReplayMatch || createdMatchId)} /> : null}
              {visibleAnalysis.parserDiagnostics?.length ? (
                <details className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-3">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-amber-200">Diagnóstico del parser</summary>
                  <div className="mt-3 grid gap-3">
                    {visibleAnalysis.parserDiagnostics.map((item) => (
                      <div key={`${item.parser}-${item.attempt}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs font-black text-white">{item.parser} · intento {item.attempt}</p>
                        <p className="mt-1 text-xs font-bold text-amber-100">{item.problem.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{item.problem.detail}</p>
                        {item.output ? <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-500">{item.output}</pre> : null}
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
              {visibleAnalysis.rawPreview ? (
                <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.16em] text-slate-400">Vista previa JSON</summary>
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{visibleAnalysis.rawPreview}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}



function ReplayMatchPreview({ match, isStored }: { match: RocketLeagueMatch; isStored: boolean }) {
  const resultLabel = match.result === 'victoria' ? 'Victoria' : match.result === 'derrota' ? 'Derrota' : match.result === 'empate' ? 'Empate' : 'Sin registro';
  const resultTone = match.result === 'victoria' ? 'text-emerald-200' : match.result === 'derrota' ? 'text-orange-200' : 'text-slate-300';

  return (
    <section className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/60">Partida generada</p>
          <h3 className="mt-1 text-lg font-black text-white">{match.mapName} · {match.mode}</h3>
        </div>
        <StatusBadge tone={isStored ? 'improvement' : 'warning'}>{isStored ? 'Guardada' : 'Lista para guardar'}</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <MetaRow label="Resultado" value={resultLabel} />
        <MetaRow label="Marcador" value={`Blue ${match.score.blue} - Orange ${match.score.orange}`} />
        <MetaRow label="Jugador base" value={`${match.playerStats.goals}G / ${match.playerStats.assists}A / ${match.playerStats.saves}S`} />
        <MetaRow label="Equipo detectado" value={match.teamColor} />
      </div>
      <p className={`mt-3 text-sm font-black ${resultTone}`}>{match.quickObservation}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{match.lesson}</p>
    </section>
  );
}

function ReplayExtractPanel({ analysis }: { analysis: ReplayAnalysisPreview }) {
  const extract = analysis.replayExtract;
  if (!extract) return null;
  const metadata = extract.metadata;

  return (
    <div className="mt-4 grid gap-4">
      <section className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Metadata extraída</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MetaRow label="Mapa" value={metadata.mapName} />
          <MetaRow label="Modo / playlist" value={metadata.playlist} />
          <MetaRow label="Duración" value={metadata.durationSeconds ? `${Math.round(metadata.durationSeconds / 60)} min` : 'No detectada'} />
          <MetaRow label="JSON" value={`${Math.round(metadata.jsonSizeBytes / 1024)} KB`} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag>Marcador {extract.score.confidence}</Tag>
          <Tag>Blue {extract.score.blue}</Tag>
          <Tag>Orange {extract.score.orange}</Tag>
        </div>
        {extract.notes.length ? (
          <div className="mt-3 grid gap-1">
            {extract.notes.map((note) => <p key={note} className="text-xs font-semibold leading-5 text-slate-400">{note}</p>)}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Jugadores detectados</p>
          <Tag>{extract.players.length}</Tag>
        </div>
        {extract.players.length ? (
          <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[1.2fr_.7fr_repeat(5,.5fr)] gap-2 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              <span>Jugador</span><span>Equipo</span><span>G</span><span>A</span><span>S</span><span>T</span><span>Pts</span>
            </div>
            {extract.players.slice(0, 8).map((player) => (
              <div key={player.id} className="grid grid-cols-[1.2fr_.7fr_repeat(5,.5fr)] gap-2 border-t border-white/10 px-3 py-2 text-xs font-bold text-slate-300">
                <span className="truncate text-white">{player.name}</span>
                <span>{player.team}</span>
                <span>{player.goals}</span>
                <span>{player.assists}</span>
                <span>{player.saves}</span>
                <span>{player.shots}</span>
                <span>{player.score}</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-xs font-semibold text-slate-500">El extractor no encontró jugadores confiables en esta pasada.</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/15 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Eventos candidatos</p>
          <Tag>{extract.events.length}</Tag>
        </div>
        {extract.events.length ? (
          <div className="mt-3 grid gap-2">
            {extract.events.slice(0, 10).map((event) => (
              <div key={event.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag>{event.type}</Tag>
                  <Tag>{formatClock(event.timestampSecond)}</Tag>
                  <Tag>{event.team}</Tag>
                </div>
                <p className="mt-2 text-sm font-black text-white">{event.description}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Confianza: {event.confidence}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-xs font-semibold text-slate-500">No se detectaron eventos granulares todavía. La próxima fase mapeará eventos específicos del JSON real.</p>}
      </section>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-white">{value || 'No detectado'}</p>
    </div>
  );
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function ControlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function PipelineStep({ title, state, detail }: { title: string; state: 'listo' | 'pendiente'; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/38 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">{title}</p>
        <StatusBadge tone={state === 'listo' ? 'improvement' : 'neutral'}>{state}</StatusBadge>
      </div>
      {detail ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}
