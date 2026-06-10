import { useMemo, useState } from 'react';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import { scanRankLog, isElectronRuntime } from '../../lib/electronBridge';
import { getPlaylistLabel, normalizePlaylistRanks } from '../../lib/rankSync';
import { formatMMR, formatSignedNumber } from '../../lib/formatters';
import type { GameMode, PlaylistRank, RankSnapshot, RocketLeagueDataStore } from '../../types/rocketLeague';

type RankSyncActions = {
  updatePlaylistRank: (rank: PlaylistRank) => void;
  mergeRankLogSnapshots: (snapshots: RankSnapshot[]) => void;
  updateSettings: (settings: Partial<RocketLeagueDataStore['settings']>) => void;
};

const PLAYLISTS: GameMode[] = ['1v1', '2v2', '3v3'];
const RANK_TIERS = ['Sin rango', 'Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III', 'Gold I', 'Gold II', 'Gold III', 'Platinum I', 'Platinum II', 'Platinum III', 'Diamond I', 'Diamond II', 'Diamond III', 'Champion I', 'Champion II', 'Champion III', 'Grand Champion I', 'Grand Champion II', 'Grand Champion III', 'Supersonic Legend'];
const DIVISIONS = ['Sin división', 'I', 'II', 'III', 'IV'];

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLabel(source: PlaylistRank['source']) {
  if (source === 'launch_log') return 'Launch.log';
  if (source === 'tracker') return 'Tracker';
  if (source === 'rocketleague_profile') return 'Perfil RL';
  if (source === 'manual') return 'Manual';
  return 'Local';
}

function rankTone(rank: PlaylistRank) {
  if (rank.status === 'error') return 'decline' as const;
  if (rank.status === 'sincronizado' || rank.status === 'experimental') return 'improvement' as const;
  if (rank.mmr > 0) return 'info' as const;
  return 'neutral' as const;
}

function buildManualRank(previous: PlaylistRank, form: ManualRankFormState): PlaylistRank {
  const mmr = safeNumber(form.mmr);
  return {
    ...previous,
    playlist: form.playlist,
    label: getPlaylistLabel(form.playlist),
    tier: form.tier,
    division: form.division,
    mmr,
    mmrDelta: mmr - (previous.mmr || 0),
    gamesToNextRank: safeNumber(form.gamesToNextRank),
    progressToNextRank: Math.max(0, Math.min(100, safeNumber(form.progressToNextRank))),
    wins: safeNumber(form.wins),
    losses: safeNumber(form.losses),
    streak: safeNumber(form.streak),
    source: 'manual',
    status: 'manual',
    lastUpdatedAt: nowIso(),
    notes: 'Snapshot guardado manualmente desde Rank Sync.',
  };
}

type ManualRankFormState = {
  playlist: GameMode;
  tier: string;
  division: string;
  mmr: string;
  gamesToNextRank: string;
  progressToNextRank: string;
  wins: string;
  losses: string;
  streak: string;
};

export function RankSyncPanel({ store, actions, compact = false }: { store: RocketLeagueDataStore; actions: RankSyncActions; compact?: boolean }) {
  const ranks = useMemo(() => normalizePlaylistRanks(store.playlistRanks), [store.playlistRanks]);
  const primaryRank = ranks.find((rank) => rank.playlist === store.profile.mainMode) ?? ranks[1] ?? ranks[0];
  const [selectedPlaylist, setSelectedPlaylist] = useState<GameMode>(primaryRank?.playlist ?? '2v2');
  const selectedRank = ranks.find((rank) => rank.playlist === selectedPlaylist) ?? ranks[1] ?? ranks[0];
  const [form, setForm] = useState<ManualRankFormState>(() => ({
    playlist: selectedRank.playlist,
    tier: selectedRank.tier,
    division: selectedRank.division,
    mmr: String(selectedRank.mmr || 0),
    gamesToNextRank: String(selectedRank.gamesToNextRank || 0),
    progressToNextRank: String(selectedRank.progressToNextRank || 0),
    wins: String(selectedRank.wins || 0),
    losses: String(selectedRank.losses || 0),
    streak: String(selectedRank.streak || 0),
  }));
  const [trackerUrl, setTrackerUrl] = useState(store.settings.trackerProfileUrl ?? '');
  const [rocketLeagueUrl, setRocketLeagueUrl] = useState(store.settings.rocketLeagueProfileUrl ?? '');
  const [feedback, setFeedback] = useState('');
  const [evidenceLines, setEvidenceLines] = useState<string[]>([]);

  function loadPlaylist(playlist: GameMode) {
    const nextRank = ranks.find((rank) => rank.playlist === playlist) ?? selectedRank;
    setSelectedPlaylist(playlist);
    setForm({
      playlist,
      tier: nextRank.tier,
      division: nextRank.division,
      mmr: String(nextRank.mmr || 0),
      gamesToNextRank: String(nextRank.gamesToNextRank || 0),
      progressToNextRank: String(nextRank.progressToNextRank || 0),
      wins: String(nextRank.wins || 0),
      losses: String(nextRank.losses || 0),
      streak: String(nextRank.streak || 0),
    });
    setFeedback('');
  }

  function saveManualRank() {
    const previous = ranks.find((rank) => rank.playlist === form.playlist) ?? selectedRank;
    actions.updatePlaylistRank(buildManualRank(previous, form));
    setFeedback(`${getPlaylistLabel(form.playlist)} actualizado con MMR ${form.mmr}.`);
  }

  async function scanLocalLog() {
    try {
      if (!isElectronRuntime()) {
        setFeedback('El escaneo de Launch.log requiere abrir la app de escritorio con Electron.');
        return;
      }
      const result = await scanRankLog();
      setEvidenceLines(result.evidenceLines ?? []);
      if (result.snapshots.length > 0) {
        actions.mergeRankLogSnapshots(result.snapshots);
        setFeedback(result.message);
      } else {
        setFeedback(result.message);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No se pudo escanear Launch.log.');
    }
  }

  function saveExternalSources() {
    actions.updateSettings({
      trackerProfileUrl: trackerUrl,
      rocketLeagueProfileUrl: rocketLeagueUrl,
      enableRankAutoSync: Boolean(trackerUrl || rocketLeagueUrl),
      updatedAt: nowIso(),
    });
    setFeedback('Fuentes externas guardadas. La apertura online queda preparada; el MMR confiable se guarda como snapshot local.');
  }

  return (
    <section className="grid gap-5">
      <article className="rounded-[1.65rem] border border-cyan-300/14 bg-slate-950/70 p-5 shadow-2xl shadow-black/24">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info" dot>Rank Sync</StatusBadge>
              <StatusBadge tone={rankTone(primaryRank)}>{sourceLabel(primaryRank.source)}</StatusBadge>
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white">MMR y rangos por modo</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-400">
              Controla 1v1, 2v2 y 3v3 por separado. El modo principal alimenta Dashboard, Progress y la tarjeta de rango.
            </p>
          </div>
          <button type="button" onClick={scanLocalLog} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/12 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-300/20">
            Escanear Launch.log
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {ranks.map((rank) => (
            <button key={rank.playlist} type="button" onClick={() => loadPlaylist(rank.playlist)} className={`rounded-[1.35rem] border p-4 text-left transition ${selectedPlaylist === rank.playlist ? 'border-cyan-300/40 bg-cyan-300/12' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.06]'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{rank.playlist}</p>
                <StatusBadge tone={rankTone(rank)}>{sourceLabel(rank.source)}</StatusBadge>
              </div>
              <p className="mt-3 text-xl font-black text-white">{rank.tier}</p>
              <p className="mt-1 text-sm font-bold text-slate-400">División {rank.division} · {formatMMR(rank.mmr)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-200" style={{ width: `${Math.max(0, Math.min(100, rank.progressToNextRank || 0))}%` }} />
              </div>
              <p className="mt-2 text-xs font-bold text-slate-500">Delta {formatSignedNumber(rank.mmrDelta)} · {rank.lastUpdatedAt ? new Date(rank.lastUpdatedAt).toLocaleString('es-HN') : 'Sin actualizar'}</p>
            </button>
          ))}
        </div>
      </article>

      {!compact ? (
        <section className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
          <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Snapshot manual</p>
            <h3 className="mt-1 text-xl font-black text-white">Actualizar modo seleccionado</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SelectField label="Modo" value={form.playlist} onChange={(value) => loadPlaylist(value as GameMode)} options={PLAYLISTS} />
              <SelectField label="Rango" value={form.tier} onChange={(tier) => setForm((current) => ({ ...current, tier }))} options={RANK_TIERS} />
              <SelectField label="División" value={form.division} onChange={(division) => setForm((current) => ({ ...current, division }))} options={DIVISIONS} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <TextField label="MMR" value={form.mmr} onChange={(mmr) => setForm((current) => ({ ...current, mmr }))} />
              <TextField label="Games to next" value={form.gamesToNextRank} onChange={(gamesToNextRank) => setForm((current) => ({ ...current, gamesToNextRank }))} />
              <TextField label="Progreso %" value={form.progressToNextRank} onChange={(progressToNextRank) => setForm((current) => ({ ...current, progressToNextRank }))} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <TextField label="Victorias" value={form.wins} onChange={(wins) => setForm((current) => ({ ...current, wins }))} />
              <TextField label="Derrotas" value={form.losses} onChange={(losses) => setForm((current) => ({ ...current, losses }))} />
              <TextField label="Racha" value={form.streak} onChange={(streak) => setForm((current) => ({ ...current, streak }))} />
            </div>
            <button type="button" onClick={saveManualRank} className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/14 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/22">
              Guardar snapshot de rango
            </button>
          </article>

          <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Fuentes externas</p>
            <h3 className="mt-1 text-xl font-black text-white">Perfil y verificación</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">Guardá tus URLs para abrirlas rápido y copiar el MMR exacto. La lectura automática online queda preparada como integración futura.</p>
            <div className="mt-4 grid gap-3">
              <TextField label="Tracker Network URL" value={trackerUrl} onChange={setTrackerUrl} placeholder="https://rocketleague.tracker.network/..." />
              <TextField label="Perfil Rocket League URL" value={rocketLeagueUrl} onChange={setRocketLeagueUrl} placeholder="https://www.rocketleague.com/..." />
              <button type="button" onClick={saveExternalSources} className="rounded-2xl border border-violet-300/30 bg-violet-300/14 px-5 py-3 text-sm font-black text-violet-100 hover:bg-violet-300/22">Guardar fuentes</button>
              <div className="grid gap-2 sm:grid-cols-2">
                <ExternalButton label="Abrir Tracker" url={trackerUrl} />
                <ExternalButton label="Abrir perfil RL" url={rocketLeagueUrl} />
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {feedback ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100">{feedback}</p> : null}
      {evidenceLines.length ? (
        <article className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Evidencia Launch.log</p>
          <div className="mt-3 grid gap-2">
            {evidenceLines.map((line, index) => <Tag key={`${line}-${index}`}>{line}</Tag>)}
          </div>
        </article>
      ) : null}
    </section>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300/40">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ExternalButton({ label, url }: { label: string; url: string }) {
  return (
    <button type="button" disabled={!url.trim()} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45">
      {label}
    </button>
  );
}
