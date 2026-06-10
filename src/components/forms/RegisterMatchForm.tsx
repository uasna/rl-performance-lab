import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type {
  DailyProgress,
  GameMode,
  MatchResult,
  MatchType,
  RocketLeagueDataStore,
  RocketLeagueMatch,
  SkillAreaId,
} from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';

type RegisterMatchActions = {
  registerMatch: (match: RocketLeagueMatch) => void;
  registerDailyProgress?: (progress: DailyProgress) => void;
};

const modes: GameMode[] = ['1v1', '2v2', '3v3'];
const matchTypes: MatchType[] = ['Ranked', 'Casual', 'Private', 'Replay Review'];
const results: MatchResult[] = ['victoria', 'derrota'];

function createId(prefix: string): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resultLabel(result: string): string {
  if (result === 'victoria') return 'Victoria';
  if (result === 'derrota') return 'Derrota';
  return 'Sin registro';
}

function getTodayProgress(store: RocketLeagueDataStore): DailyProgress | null {
  const today = new Date().toISOString().slice(0, 10);
  return store.dailyProgress.find((progress) => progress.date === today) ?? null;
}

function buildMergedDailyProgress(store: RocketLeagueDataStore, match: RocketLeagueMatch): DailyProgress {
  const today = match.playedAt.slice(0, 10);
  const existing = getTodayProgress(store);
  const isWin = match.result === 'victoria';
  const isLoss = match.result === 'derrota';
  const isDraw = match.result === 'empate';
  const mmrStart = existing?.mmrStart || match.mmrBefore || 0;
  const mmrEnd = match.mmrAfter || existing?.mmrEnd || 0;

  return {
    id: `progress-${today}`,
    date: today,
    playedMatches: (existing?.playedMatches ?? 0) + 1,
    wins: (existing?.wins ?? 0) + (isWin ? 1 : 0),
    losses: (existing?.losses ?? 0) + (isLoss ? 1 : 0),
    draws: (existing?.draws ?? 0) + (isDraw ? 1 : 0),
    trainingMinutes: existing?.trainingMinutes ?? 0,
    mmrStart,
    mmrEnd,
    mmrDelta: mmrEnd - mmrStart,
    completedBlocks: existing?.completedBlocks ?? 0,
    totalBlocks: existing?.totalBlocks ?? 0,
    focusAreaId: match.recommendedFocusAreaId ?? match.affectedAreaId ?? 'positioning',
    summary: match.quickObservation || match.notes || 'Partida registrada manualmente.',
    source: 'manual',
  };
}

export function RegisterMatchForm({
  store,
  actions,
}: {
  store: RocketLeagueDataStore;
  actions: RegisterMatchActions;
}) {
  const [mode, setMode] = useState<GameMode>(store.profile.mainMode === '1v1' || store.profile.mainMode === '2v2' || store.profile.mainMode === '3v3' ? store.profile.mainMode : '2v2');
  const [matchType, setMatchType] = useState<MatchType>('Ranked');
  const [result, setResult] = useState<MatchResult>('victoria');
  const [ownScore, setOwnScore] = useState('0');
  const [rivalScore, setRivalScore] = useState('0');
  const [mmrBefore, setMmrBefore] = useState(String(store.profile.rank.mmr || 0));
  const [mmrAfter, setMmrAfter] = useState(String(store.profile.rank.mmr || 0));
  const [goals, setGoals] = useState('0');
  const [assists, setAssists] = useState('0');
  const [saves, setSaves] = useState('0');
  const [shots, setShots] = useState('0');
  const [demos, setDemos] = useState('0');
  const [mainErrorId, setMainErrorId] = useState(store.frequentErrors[0]?.id ?? '');
  const [affectedAreaId, setAffectedAreaId] = useState<SkillAreaId>('positioning');
  const [note, setNote] = useState('');
  const [nextFocus, setNextFocus] = useState('');
  const [feedback, setFeedback] = useState('');

  const selectedError = useMemo(
    () => store.frequentErrors.find((error) => error.id === mainErrorId) ?? null,
    [mainErrorId, store.frequentErrors],
  );

  function resetForm() {
    setOwnScore('0');
    setRivalScore('0');
    setGoals('0');
    setAssists('0');
    setSaves('0');
    setShots('0');
    setDemos('0');
    setNote('');
    setNextFocus('');
    setMmrBefore(String(toNumber(mmrAfter)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    const before = toNumber(mmrBefore);
    const after = toNumber(mmrAfter);
    const own = toNumber(ownScore);
    const rival = toNumber(rivalScore);
    const matchId = createId('match');
    const mainErrorTitle = selectedError?.title ?? 'Sin error seleccionado';

    const match: RocketLeagueMatch = {
      id: matchId,
      playedAt: now,
      mapName: 'Registro manual',
      mode,
      playlist: matchType,
      matchType,
      result,
      teamColor: 'blue',
      durationSeconds: 0,
      score: {
        blue: own,
        orange: rival,
      },
      playerStats: {
        goals: toNumber(goals),
        assists: toNumber(assists),
        saves: toNumber(saves),
        shots: toNumber(shots),
        demos: toNumber(demos),
        score: 0,
      },
      performance: {
        avgSpeed: 0,
        boostCollected: 0,
        boostWasted: 0,
        shootingAccuracy: 0,
        possessionPressure: 0,
        defensiveErrors: result === 'derrota' ? 1 : 0,
        overcommitCount: mainErrorTitle.toLowerCase().includes('overcommit') ? 1 : 0,
      },
      rankSnapshot: {
        id: createId('rank'),
        capturedAt: now,
        playlist: mode,
        tier: store.profile.rank.tier,
        division: store.profile.rank.division,
        mmr: after,
        mmrDelta: after - before,
        gamesToNextRank: 0,
        progressToNextRank: 0,
        source: 'manual',
      },
      mmrBefore: before,
      mmrAfter: after,
      events: [],
      personalMetrics: {
        movement: 0,
        boost: 0,
        offence: 0,
        defence: 0,
        rotation: 0,
        positioning: 0,
      },
      quickObservation: note,
      mainErrorId,
      mainErrorTitle,
      affectedAreaId,
      recommendedFocusAreaId: affectedAreaId,
      recommendedFocus: nextFocus,
      lesson: note || 'Revisar la decisión principal de la partida antes de jugar la siguiente.',
      nextTrainingAction: nextFocus || 'Elegir un foco concreto para el próximo bloque de entrenamiento.',
      notes: note,
      tags: [mode, matchType, resultLabel(result), mainErrorTitle].filter(Boolean),
      source: 'manual',
    };

    actions.registerMatch(match);
    actions.registerDailyProgress?.(buildMergedDailyProgress(store, match));
    setFeedback('Partida guardada. Dashboard, progreso e historial se actualizaron.');
    resetForm();
  }

  return (
    <article className="rounded-[1.5rem] border border-cyan-300/14 bg-cyan-300/[0.055] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Registro manual</p>
          <h2 className="mt-1 text-xl font-black text-white">Registrar partida</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">Datos mínimos para alimentar dashboard, historial, progreso y foco siguiente.</p>
        </div>
        <StatusBadge tone="info">localStorage</StatusBadge>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField label="Modo" value={mode} onChange={(value) => setMode(value as GameMode)} options={modes} />
          <SelectField label="Tipo" value={matchType} onChange={(value) => setMatchType(value as MatchType)} options={matchTypes} />
          <SelectField label="Resultado" value={result} onChange={(value) => setResult(value as MatchResult)} options={results} getLabel={resultLabel} />
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <NumberField label="Marcador propio" value={ownScore} onChange={setOwnScore} />
          <NumberField label="Marcador rival" value={rivalScore} onChange={setRivalScore} />
          <NumberField label="MMR antes" value={mmrBefore} onChange={setMmrBefore} />
          <NumberField label="MMR después" value={mmrAfter} onChange={setMmrAfter} />
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <NumberField label="Goles" value={goals} onChange={setGoals} />
          <NumberField label="Asistencias" value={assists} onChange={setAssists} />
          <NumberField label="Salvadas" value={saves} onChange={setSaves} />
          <NumberField label="Tiros" value={shots} onChange={setShots} />
          <NumberField label="Demos" value={demos} onChange={setDemos} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SelectField label="Error principal" value={mainErrorId} onChange={setMainErrorId} options={store.frequentErrors.map((error) => error.id)} getLabel={(id) => store.frequentErrors.find((error) => error.id === id)?.title ?? id} />
          <SelectField label="Área afectada" value={affectedAreaId} onChange={(value) => setAffectedAreaId(value as SkillAreaId)} options={store.skillAreas.map((area) => area.id)} getLabel={(id) => store.skillAreas.find((area) => area.id === id)?.name ?? id} />
        </div>

        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Nota breve</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/40" placeholder="Qué pasó y qué decisión querés revisar." />
        </label>

        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Foco para próxima partida</span>
          <input value={nextFocus} onChange={(event) => setNextFocus(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-300/40" placeholder="Ej: no saltar al primer challenge como segundo hombre." />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Tag>MMR delta {toNumber(mmrAfter) - toNumber(mmrBefore)}</Tag>
            <Tag>{selectedError?.title ?? 'Sin error'}</Tag>
          </div>
          <button type="submit" className="rounded-2xl border border-cyan-300/30 bg-cyan-300/14 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/20">
            Guardar partida
          </button>
        </div>
        {feedback ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100">{feedback}</p> : null}
      </form>
    </article>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300/40" />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  getLabel,
}: {
  label: string;
  value: T | string;
  onChange: (value: string) => void;
  options: T[] | string[];
  getLabel?: (value: string) => string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300/40">
        {options.map((option) => (
          <option key={option} value={option} className="bg-slate-950 text-white">
            {getLabel ? getLabel(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}
