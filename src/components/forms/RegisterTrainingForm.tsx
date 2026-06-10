import type { FormEvent } from 'react';
import { useState } from 'react';
import type { DailyProgress, RocketLeagueDataStore, SkillAreaId, TrainingBlock, TrainingSession } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';

type BlockType = NonNullable<TrainingBlock['blockType']>;

type RegisterTrainingActions = {
  registerTrainingSession: (session: TrainingSession) => void;
  registerDailyProgress?: (progress: DailyProgress) => void;
};

const blockTypes: { value: BlockType; label: string }[] = [
  { value: 'freeplay', label: 'Freeplay' },
  { value: 'training_pack', label: 'Training packs internos' },
  { value: 'replay_review', label: 'Replay review' },
  { value: 'casual_objective', label: 'Casual con objetivo' },
  { value: 'ranked_objective', label: 'Ranked con objetivo' },
  { value: 'duel_objective', label: '1v1 con objetivo' },
  { value: 'rest', label: 'Descanso' },
];

function createId(prefix: string): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getTodayProgress(store: RocketLeagueDataStore): DailyProgress | null {
  const today = todayKey();
  return store.dailyProgress.find((progress) => progress.date === today) ?? null;
}

export function RegisterTrainingForm({ store, actions }: { store: RocketLeagueDataStore; actions: RegisterTrainingActions }) {
  const [blockType, setBlockType] = useState<BlockType>('freeplay');
  const [duration, setDuration] = useState('15');
  const [areaId, setAreaId] = useState<SkillAreaId>('movement');
  const [consistency, setConsistency] = useState('0');
  const [difficulty, setDifficulty] = useState('0');
  const [energy, setEnergy] = useState('0');
  const [note, setNote] = useState('');
  const [visibleResult, setVisibleResult] = useState('');
  const [feedback, setFeedback] = useState('');

  const selectedTypeLabel = blockTypes.find((type) => type.value === blockType)?.label ?? blockType;
  const selectedArea = store.skillAreas.find((area) => area.id === areaId);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const now = new Date().toISOString();
    const safeDuration = toNumber(duration);
    const safeConsistency = toNumber(consistency);
    const safeDifficulty = toNumber(difficulty);
    const safeEnergy = toNumber(energy);

    const block: TrainingBlock = {
      id: createId('block'),
      areaId,
      title: selectedTypeLabel,
      description: visibleResult || note || 'Bloque registrado manualmente.',
      durationMinutes: safeDuration,
      targetRepetitions: 0,
      completedRepetitions: 0,
      status: 'completado',
      trainingPackCode: 'Entrenamiento interno',
      source: 'manual',
      blockType,
      objective: visibleResult || 'Registrar una mejora visible del bloque.',
    };

    const session: TrainingSession = {
      id: createId('training-session'),
      startedAt: now,
      endedAt: now,
      title: `Registro manual · ${selectedTypeLabel}`,
      focusAreaId: areaId,
      durationMinutes: safeDuration,
      blocks: [block],
      perceivedDifficulty: safeDifficulty,
      perceivedEnergy: safeEnergy,
      focusScore: 0,
      consistencyScore: safeConsistency,
      notes: note,
      visibleResult,
      source: 'manual',
    };

    const existing = getTodayProgress(store);
    const today = todayKey();
    actions.registerTrainingSession(session);
    actions.registerDailyProgress?.({
      id: `progress-${today}`,
      date: today,
      playedMatches: existing?.playedMatches ?? 0,
      wins: existing?.wins ?? 0,
      losses: existing?.losses ?? 0,
      draws: existing?.draws ?? 0,
      trainingMinutes: (existing?.trainingMinutes ?? 0) + safeDuration,
      mmrStart: existing?.mmrStart ?? 0,
      mmrEnd: existing?.mmrEnd ?? 0,
      mmrDelta: existing?.mmrDelta ?? 0,
      completedBlocks: (existing?.completedBlocks ?? 0) + 1,
      totalBlocks: (existing?.totalBlocks ?? 0) + 1,
      focusAreaId: areaId,
      summary: visibleResult || note || 'Entrenamiento manual registrado.',
      source: 'manual',
    });

    setFeedback('Entrenamiento guardado. Dashboard y progreso se actualizaron.');
    setNote('');
    setVisibleResult('');
    setConsistency('0');
    setDifficulty('0');
    setEnergy('0');
  }

  return (
    <article className="rounded-[1.5rem] border border-emerald-300/14 bg-emerald-300/[0.055] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Formulario principal</p>
          <h2 className="mt-1 text-xl font-black text-white">Registrar entrenamiento manual</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">Entrenamiento interno y registro manual. Sin dependencias externas.</p>
        </div>
        <StatusBadge tone="improvement">Guardar</StatusBadge>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo de bloque</span>
            <select value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-emerald-300/40">
              {blockTypes.map((type) => <option key={type.value} value={type.value} className="bg-slate-950 text-white">{type.label}</option>)}
            </select>
          </label>
          <NumberField label="Duración" suffix="min" value={duration} onChange={setDuration} />
          <label className="grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Área entrenada</span>
            <select value={areaId} onChange={(event) => setAreaId(event.target.value as SkillAreaId)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-emerald-300/40">
              {store.skillAreas.map((area) => <option key={area.id} value={area.id} className="bg-slate-950 text-white">{area.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <NumberField label="Consistencia percibida" suffix="/5" value={consistency} onChange={setConsistency} />
          <NumberField label="Dificultad" suffix="/5" value={difficulty} onChange={setDifficulty} />
          <NumberField label="Energía" suffix="/5" value={energy} onChange={setEnergy} />
        </div>

        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Resultado visible</span>
          <input value={visibleResult} onChange={(event) => setVisibleResult(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-emerald-300/40" placeholder="Ej: completé el bloque sin tilt, mejores recoveries, más back post." />
        </label>

        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Nota</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-emerald-300/40" placeholder="Qué salió bien, qué costó y qué repetir mañana." />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Tag>{selectedTypeLabel}</Tag>
            <Tag>{selectedArea?.name ?? areaId}</Tag>
          </div>
          <button type="submit" className="rounded-2xl border border-emerald-300/30 bg-emerald-300/14 px-5 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-300/20">
            Guardar entrenamiento
          </button>
        </div>
        {feedback ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100">{feedback}</p> : null}
      </form>
    </article>
  );
}

function NumberField({ label, suffix, value, onChange }: { label: string; suffix?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 focus-within:border-emerald-300/40">
        <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-black text-white outline-none" />
        {suffix ? <span className="border-l border-white/10 px-3 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  );
}
