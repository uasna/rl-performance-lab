import { useMemo, useState } from 'react';
import {
  captureMmrScreen,
  getMmrOcrStatus,
  isElectronRuntime,
  openMmrOcrFolder,
  saveMmrOcrSample,
  type MmrOcrStatus,
  type MmrScreenCapture,
} from '../../lib/electronBridge';
import { createRankId, getPlaylistLabel } from '../../lib/rankSync';
import type { GameMode, PlaylistRank, RocketLeagueSettings } from '../../types/rocketLeague';

type RankedPlaylist = Extract<GameMode, '1v1' | '2v2' | '3v3'>;

type Props = {
  settings: RocketLeagueSettings;
  playlistRanks: PlaylistRank[];
  onSaveSettings: (settings: Partial<RocketLeagueSettings>) => void;
  onSaveRank: (rank: PlaylistRank) => void;
};

const PLAYLISTS: RankedPlaylist[] = ['1v1', '2v2', '3v3'];

const DEFAULT_ROI = {
  x: 71,
  y: 72,
  width: 18,
  height: 10,
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function MmrOcrHub({ settings, playlistRanks, onSaveSettings, onSaveRank }: Props) {
  const ocr = { enabled: false, autoPromptAfterMatch: true, playlist: settings.mainPlaylistFilter === '1v1' || settings.mainPlaylistFilter === '2v2' || settings.mainPlaylistFilter === '3v3' ? settings.mainPlaylistFilter : '2v2', roi: DEFAULT_ROI, status: 'sin_configurar' as const, ...(settings.mmrOcr ?? {}) };
  const [status, setStatus] = useState<MmrOcrStatus | null>(null);
  const [capture, setCapture] = useState<MmrScreenCapture | null>(null);
  const [playlist, setPlaylist] = useState<RankedPlaylist>((ocr.playlist === '1v1' || ocr.playlist === '2v2' || ocr.playlist === '3v3') ? ocr.playlist : '2v2');
  const [mmr, setMmr] = useState(String(ocr.lastConfirmedMmr || ''));
  const [tier, setTier] = useState('Sin rango');
  const [division, setDivision] = useState('Sin división');
  const [roi, setRoi] = useState(ocr.roi ?? DEFAULT_ROI);
  const [feedback, setFeedback] = useState('');

  const currentRank = useMemo(() => playlistRanks.find((rank) => rank.playlist === playlist), [playlistRanks, playlist]);

  async function refreshStatus() {
    if (!isElectronRuntime()) return;
    const result = await getMmrOcrStatus();
    setStatus(result);
    onSaveSettings({ mmrOcr: { ...ocr, sampleCount: result.sampleCount, status: result.sampleCount > 0 ? 'calibrando' : ocr.status } });
  }

  async function captureScreen() {
    if (!isElectronRuntime()) return;
    const result = await captureMmrScreen();
    setCapture(result);
    setFeedback(result.message);
    onSaveSettings({ mmrOcr: { ...ocr, enabled: true, playlist, roi, status: result.ok ? 'calibrando' : 'error', lastCaptureAt: result.capturedAt } });
  }

  function updateRoi(key: keyof typeof roi, value: string) {
    const next = { ...roi, [key]: clampPercent(Number(value)) };
    setRoi(next);
    onSaveSettings({ mmrOcr: { ...ocr, roi: next, playlist, status: 'calibrando' } });
  }

  async function saveSnapshot() {
    const nextMmr = Number(mmr);
    if (!Number.isFinite(nextMmr) || nextMmr <= 0) {
      setFeedback('Escribí el MMR leído en pantalla antes de guardar el snapshot.');
      return;
    }
    const now = new Date().toISOString();
    const previous = currentRank;
    const nextRank: PlaylistRank = {
      ...(previous ?? {
        id: createRankId(playlist),
        playlist,
        label: getPlaylistLabel(playlist),
        tier: 'Sin rango',
        division: 'Sin división',
        mmr: 0,
        mmrDelta: 0,
        gamesToNextRank: 0,
        progressToNextRank: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        source: 'local_ocr',
        status: 'sincronizado',
        lastUpdatedAt: now,
      }),
      playlist,
      label: getPlaylistLabel(playlist),
      tier: tier || previous?.tier || 'Sin rango',
      division: division || previous?.division || 'Sin división',
      mmr: nextMmr,
      mmrDelta: nextMmr - (Number(previous?.mmr) || 0),
      source: 'local_ocr',
      status: 'sincronizado',
      lastUpdatedAt: now,
      notes: 'Snapshot confirmado desde captura local OCR/manual. No usa APIs externas ni tráfico de red.',
    };

    onSaveRank(nextRank);
    onSaveSettings({ mmrOcr: { ...ocr, enabled: true, playlist, roi, status: 'listo', lastConfirmedMmr: nextMmr, lastCaptureAt: capture?.capturedAt ?? now } });

    if (isElectronRuntime()) {
      const result = await saveMmrOcrSample({
        id: `mmr-${playlist}-${Date.now()}`,
        dataUrl: capture?.dataUrl,
        playlist,
        confirmedMmr: nextMmr,
        tier: nextRank.tier,
        division: nextRank.division,
        roi,
        source: 'manual_confirmed_ocr',
        notes: 'Muestra confirmada localmente para calibrar el OCR ligero futuro.',
      });
      setStatus(result);
    }
    setFeedback(`MMR ${nextMmr} guardado para ${playlist}. Dashboard y Progress se actualizan con este snapshot.`);
  }

  async function openFolder() {
    if (!isElectronRuntime()) return;
    const directory = await openMmrOcrFolder();
    setFeedback(`Carpeta OCR abierta: ${directory}`);
  }

  return (
    <section className="analyzer-card mmr-ocr-hub">
      <div className="live-api-header">
        <div>
          <p className="pdf-card-label">MMR OCR local</p>
          <strong>Lectura ToS-friendly desde pantalla</strong>
          <span>La Stats API avisa cuándo estás jugando; el MMR se registra leyendo/capturando la pantalla post-game, sin scraping ni tráfico interceptado.</span>
        </div>
        <span className={`analyzer-pill ${ocr.status === 'listo' ? 'green' : 'cyan'}`}>{ocr.status === 'listo' ? 'Listo' : 'Calibración'}</span>
      </div>

      <div className="ocr-grid">
        <div className="ocr-panel">
          <div className="ocr-actions">
            <button type="button" onClick={refreshStatus} disabled={!isElectronRuntime()}>Comprobar OCR</button>
            <button type="button" onClick={captureScreen} disabled={!isElectronRuntime()}>Capturar pantalla</button>
            <button type="button" onClick={openFolder} disabled={!isElectronRuntime()}>Abrir muestras</button>
          </div>
          <div className="ocr-preview">
            {capture?.dataUrl ? <img src={capture.dataUrl} alt="Captura local para OCR de MMR" /> : <div><strong>Sin captura</strong><span>Entrá al scoreboard final de ranked y capturá pantalla.</span></div>}
            <div className="ocr-roi" style={{ left: `${roi.x}%`, top: `${roi.y}%`, width: `${roi.width}%`, height: `${roi.height}%` }} />
          </div>
        </div>

        <div className="ocr-panel">
          <p className="pdf-card-label">Snapshot MMR</p>
          <div className="ocr-form-grid">
            <label><span>Playlist</span><select value={playlist} onChange={(event) => setPlaylist(event.target.value as RankedPlaylist)}>{PLAYLISTS.map((mode) => <option key={mode}>{mode}</option>)}</select></label>
            <label><span>MMR leído</span><input value={mmr} onChange={(event) => setMmr(event.target.value)} inputMode="numeric" placeholder="Ej. 1109" /></label>
            <label><span>Rango</span><input value={tier} onChange={(event) => setTier(event.target.value)} placeholder="Champion I" /></label>
            <label><span>División</span><input value={division} onChange={(event) => setDivision(event.target.value)} placeholder="Division II" /></label>
          </div>
          <div className="ocr-roi-grid">
            <label><span>X</span><input value={roi.x} onChange={(event) => updateRoi('x', event.target.value)} /></label>
            <label><span>Y</span><input value={roi.y} onChange={(event) => updateRoi('y', event.target.value)} /></label>
            <label><span>W</span><input value={roi.width} onChange={(event) => updateRoi('width', event.target.value)} /></label>
            <label><span>H</span><input value={roi.height} onChange={(event) => updateRoi('height', event.target.value)} /></label>
          </div>
          <button type="button" className="install" onClick={saveSnapshot}>Guardar MMR snapshot</button>
          <div className="ocr-status-grid">
            <OcrMini label="Muestras" value={status?.sampleCount ?? ocr.sampleCount ?? 0} />
            <OcrMini label="Modelo" value={status?.modelStatus === 'dataset_local_en_crecimiento' ? 'Dataset local' : 'Pendiente'} />
            <OcrMini label="Actual" value={currentRank?.mmr ?? 0} />
          </div>
          <p className="account-hint">{feedback || status?.message || 'Primer paso: captura + confirmación. Luego se puede reemplazar la confirmación por modelos OCR locales entrenados.'}</p>
        </div>
      </div>
    </section>
  );
}

function OcrMini({ label, value }: { label: string; value: string | number }) {
  return <div className="live-stat"><span>{label}</span><strong>{value}</strong></div>;
}
