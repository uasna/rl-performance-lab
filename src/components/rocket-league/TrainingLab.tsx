import { useEffect, useMemo, useState } from 'react';
import { buildSessionCoachPlan } from '../../lib/sessionCoach';
import { formatFullDateLabel, formatMinutes } from '../../lib/formatters';
import type { RocketLeagueDataStore, SkillAreaId, TrainingBlock, TrainingBlockStatus, TrainingSession } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import { TrainingPackRecommendations } from './TrainingPackRecommendations';

type RuntimeBlock = TrainingBlock & {
  remainingSeconds: number;
  elapsedSeconds: number;
};

type TrainingLabActions = {
  registerTrainingSession: (session: TrainingSession) => void;
  registerDailyProgress?: (progress: {
    id: string;
    date: string;
    playedMatches: number;
    wins: number;
    losses: number;
    draws: number;
    trainingMinutes: number;
    mmrStart: number;
    mmrEnd: number;
    mmrDelta: number;
    completedBlocks: number;
    totalBlocks: number;
    focusAreaId: SkillAreaId;
    summary: string;
    source: 'manual';
  }) => void;
};

const statusLabels: Record<TrainingBlockStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  completado: 'Completado',
  omitido: 'Omitido',
};

function createRuntimeBlocks(sourceBlocks: TrainingBlock[]): RuntimeBlock[] {
  return sourceBlocks.map((block) => ({
    ...block,
    status: 'pendiente',
    completedRepetitions: 0,
    remainingSeconds: block.durationMinutes * 60,
    elapsedSeconds: 0,
  }));
}

function toTrainingBlock(block: RuntimeBlock): TrainingBlock {
  return {
    id: block.id,
    areaId: block.areaId,
    title: block.title,
    description: block.description,
    durationMinutes: block.durationMinutes,
    targetRepetitions: block.targetRepetitions,
    completedRepetitions: block.completedRepetitions,
    status: block.status,
    trainingPackCode: block.trainingPackCode,
    source: 'manual',
    blockType: block.blockType,
    objective: block.objective,
  };
}

function buildManualSessionId(): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `training-${randomId}`;
}

function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function statusTone(status: TrainingBlockStatus): 'neutral' | 'warning' | 'improvement' | 'info' {
  if (status === 'completado') return 'improvement';
  if (status === 'en_progreso') return 'info';
  if (status === 'omitido') return 'warning';
  return 'neutral';
}

export function TrainingLab({ store, actions }: { store: RocketLeagueDataStore; actions: TrainingLabActions }) {
  const coachPlan = useMemo(() => buildSessionCoachPlan(store), [store]);
  const [blocks, setBlocks] = useState<RuntimeBlock[]>(() => createRuntimeBlocks(coachPlan.blocks));
  const [activeBlockId, setActiveBlockId] = useState(blocks[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [difficulty, setDifficulty] = useState(0);
  const [consistency, setConsistency] = useState(0);
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState('');

  const activeBlock = blocks.find((block) => block.id === activeBlockId) ?? blocks[0];
  const totalMinutes = useMemo(() => blocks.reduce((total, block) => total + block.durationMinutes, 0), [blocks]);
  const completedBlocks = blocks.filter((block) => block.status === 'completado');
  const completedMinutes = completedBlocks.reduce((total, block) => total + block.durationMinutes, 0);
  const sessionProgress = blocks.length > 0 ? Math.round((completedBlocks.length / blocks.length) * 100) : 0;

  useEffect(() => {
    if (!running || !activeBlock) return undefined;

    const timer = window.setInterval(() => {
      setBlocks((currentBlocks) => currentBlocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        const nextRemaining = Math.max(0, block.remainingSeconds - 1);
        const finished = nextRemaining === 0;
        if (finished) {
          window.setTimeout(() => setRunning(false), 0);
        }
        return {
          ...block,
          remainingSeconds: nextRemaining,
          elapsedSeconds: Math.min(block.durationMinutes * 60, block.elapsedSeconds + 1),
          status: finished ? 'completado' : 'en_progreso',
        };
      }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeBlock, running]);

  function startBlock(blockId = activeBlockId) {
    setActiveBlockId(blockId);
    setRunning(true);
    setBlocks((currentBlocks) => currentBlocks.map((block) => (
      block.id === blockId && block.status !== 'completado' ? { ...block, status: 'en_progreso' } : block
    )));
  }

  function pauseBlock() {
    setRunning(false);
  }

  function resetBlock() {
    if (!activeBlock) return;
    setRunning(false);
    setBlocks((currentBlocks) => currentBlocks.map((block) => (
      block.id === activeBlock.id
        ? { ...block, status: 'pendiente', remainingSeconds: block.durationMinutes * 60, elapsedSeconds: 0, completedRepetitions: 0 }
        : block
    )));
  }

  function completeBlock(blockId = activeBlockId) {
    setRunning(false);
    setBlocks((currentBlocks) => currentBlocks.map((block) => (
      block.id === blockId
        ? { ...block, status: 'completado', remainingSeconds: 0, elapsedSeconds: block.durationMinutes * 60, completedRepetitions: block.targetRepetitions }
        : block
    )));
  }

  function resetRoutine() {
    setRunning(false);
    const freshBlocks = createRuntimeBlocks(coachPlan.blocks);
    setBlocks(freshBlocks);
    setActiveBlockId(freshBlocks[0]?.id ?? '');
    setEnergy(0);
    setDifficulty(0);
    setConsistency(0);
    setNotes('');
    setFeedback('Rutina reiniciada.');
  }

  function saveSession() {
    const now = new Date().toISOString();
    const session: TrainingSession = {
      id: buildManualSessionId(),
      startedAt: now,
      endedAt: now,
      title: `Rutina coach · ${coachPlan.focusAreaName}`,
      focusAreaId: coachPlan.focusAreaId,
      durationMinutes: completedMinutes,
      blocks: blocks.map(toTrainingBlock),
      perceivedDifficulty: difficulty,
      perceivedEnergy: energy,
      focusScore: 0,
      consistencyScore: consistency,
      notes,
      source: 'manual',
    };

    actions.registerTrainingSession(session);
    actions.registerDailyProgress?.({
      id: `progress-${now.slice(0, 10)}`,
      date: now.slice(0, 10),
      playedMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      trainingMinutes: completedMinutes,
      mmrStart: 0,
      mmrEnd: 0,
      mmrDelta: 0,
      completedBlocks: completedBlocks.length,
      totalBlocks: blocks.length,
      focusAreaId: coachPlan.focusAreaId,
      summary: notes || `Entrenamiento coach registrado · ${coachPlan.focusAreaName}.`,
      source: 'manual',
    });
    setFeedback('Entrenamiento guardado en localStorage.');
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <article className="overflow-hidden rounded-[1.75rem] border border-cyan-300/14 bg-slate-950/70 p-5 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="info" dot>Training Lab</StatusBadge>
                <StatusBadge tone="improvement">Coach por sesión</StatusBadge>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Rutina coach · {coachPlan.focusAreaName}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-400">
                Plan de 90 minutos generado desde tus últimas partidas. Solo usa entrenamiento interno, replay review manual y partidas con objetivo.
              </p>
            </div>
            <div className="grid min-w-[220px] gap-2 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
              <SummaryRow label="Duración" value={formatMinutes(totalMinutes)} />
              <SummaryRow label="Foco" value={coachPlan.focusAreaName} />
              <SummaryRow label="Confianza" value={coachPlan.confidence} />
              <SummaryRow label="Completado" value={`${completedBlocks.length}/${blocks.length}`} />
            </div>
          </div>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${sessionProgress}%` }} />
          </div>
        </article>

        <TimerPanel
          activeBlock={activeBlock}
          running={running}
          onStart={() => startBlock()}
          onPause={pauseBlock}
          onReset={resetBlock}
          onComplete={() => completeBlock()}
        />
      </section>

      <TrainingPackRecommendations store={store} areaId={coachPlan.focusAreaId} />

      <section className="grid gap-5 2xl:grid-cols-[1.25fr_.75fr]">
        <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Bloques del coach</p>
              <h2 className="mt-1 text-2xl font-black text-white">Plan por tendencia</h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">{coachPlan.summary}</p>
            </div>
            <button type="button" onClick={resetRoutine} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200 hover:bg-white/[0.07]">
              Regenerar rutina
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {blocks.map((block) => (
              <TrainingLabBlockCard
                key={block.id}
                block={block}
                active={block.id === activeBlockId}
                onUseTimer={() => startBlock(block.id)}
                onComplete={() => completeBlock(block.id)}
                onSelect={() => setActiveBlockId(block.id)}
              />
            ))}
          </div>
        </article>

        <aside className="grid gap-5 content-start">
          <ManualTrainingLog
            energy={energy}
            difficulty={difficulty}
            consistency={consistency}
            notes={notes}
            feedback={feedback}
            onEnergy={setEnergy}
            onDifficulty={setDifficulty}
            onConsistency={setConsistency}
            onNotes={setNotes}
            onSave={saveSession}
          />
          <RecentTrainingSessions sessions={store.trainingSessions} />
        </aside>
      </section>
    </div>
  );
}

function TimerPanel({
  activeBlock,
  running,
  onStart,
  onPause,
  onReset,
  onComplete,
}: {
  activeBlock: RuntimeBlock | undefined;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onComplete: () => void;
}) {
  const totalSeconds = activeBlock ? activeBlock.durationMinutes * 60 : 1;
  const remainingSeconds = activeBlock?.remainingSeconds ?? 0;
  const elapsedSeconds = activeBlock?.elapsedSeconds ?? 0;
  const progress = totalSeconds > 0 ? Math.round((elapsedSeconds / totalSeconds) * 100) : 0;

  return (
    <article className="rounded-[1.75rem] border border-violet-300/16 bg-violet-300/[0.07] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/65">Timer activo</p>
          <h2 className="mt-2 text-xl font-black text-white">{activeBlock?.title ?? 'Sin bloque'}</h2>
        </div>
        <StatusBadge tone={activeBlock ? statusTone(activeBlock.status) : 'neutral'}>{activeBlock ? statusLabels[activeBlock.status] : 'Sin bloque'}</StatusBadge>
      </div>

      <p className="mt-5 text-6xl font-black tabular-nums tracking-tight text-white">{formatClock(remainingSeconds)}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-violet-100/70">{activeBlock?.objective ?? 'Seleccioná un bloque para usar el timer.'}</p>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-violet-200 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <TimerButton onClick={onStart} disabled={!activeBlock || running}>{elapsedSeconds > 0 && !running ? 'Resume' : 'Start'}</TimerButton>
        <TimerButton onClick={onPause} disabled={!activeBlock || !running}>Pause</TimerButton>
        <TimerButton onClick={onStart} disabled={!activeBlock || running || remainingSeconds === 0}>Resume</TimerButton>
        <TimerButton onClick={onReset} disabled={!activeBlock}>Reset</TimerButton>
        <TimerButton onClick={onComplete} disabled={!activeBlock}>Complete</TimerButton>
      </div>
    </article>
  );
}

function TrainingLabBlockCard({
  block,
  active,
  onUseTimer,
  onComplete,
  onSelect,
}: {
  block: RuntimeBlock;
  active: boolean;
  onUseTimer: () => void;
  onComplete: () => void;
  onSelect: () => void;
}) {
  const totalSeconds = block.durationMinutes * 60;
  const progress = totalSeconds > 0 ? Math.round((block.elapsedSeconds / totalSeconds) * 100) : 0;

  return (
    <article className={`rounded-[1.35rem] border p-4 transition ${active ? 'border-cyan-300/35 bg-cyan-300/[0.075]' : 'border-white/10 bg-slate-950/35 hover:border-white/16'}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" onClick={onSelect} className="text-left">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone(block.status)}>{statusLabels[block.status]}</StatusBadge>
            <Tag>{formatMinutes(block.durationMinutes)}</Tag>
            <Tag>{block.trainingPackCode}</Tag>
          </div>
          <h3 className="mt-3 text-lg font-black text-white">{block.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{block.description}</p>
          <p className="mt-2 text-sm font-bold text-cyan-100/75">Objetivo: {block.objective}</p>
        </button>
        <div className="grid min-w-[190px] gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <button type="button" onClick={onUseTimer} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/16">
            Usar timer
          </button>
          <button type="button" onClick={onComplete} className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-black text-emerald-100 hover:bg-emerald-300/16">
            Completar bloque
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <span className="w-16 text-right text-xs font-black tabular-nums text-slate-400">{formatClock(block.remainingSeconds)}</span>
      </div>
    </article>
  );
}

function ManualTrainingLog({
  energy,
  difficulty,
  consistency,
  notes,
  feedback,
  onEnergy,
  onDifficulty,
  onConsistency,
  onNotes,
  onSave,
}: {
  energy: number;
  difficulty: number;
  consistency: number;
  notes: string;
  feedback: string;
  onEnergy: (value: number) => void;
  onDifficulty: (value: number) => void;
  onConsistency: (value: number) => void;
  onNotes: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Registro manual</p>
      <h2 className="mt-1 text-xl font-black text-white">Percepción del entrenamiento</h2>
      <div className="mt-4 grid gap-4">
        <RatingInput label="Energía" value={energy} onChange={onEnergy} />
        <RatingInput label="Dificultad" value={difficulty} onChange={onDifficulty} />
        <RatingInput label="Consistencia" value={consistency} onChange={onConsistency} />
        <label className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Notas</span>
          <textarea
            value={notes}
            onChange={(event) => onNotes(event.target.value)}
            rows={4}
            placeholder="Qué salió bien, qué falló y qué repetir mañana."
            className="resize-none rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-semibold text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/35"
          />
        </label>
        <button type="button" onClick={onSave} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/12 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-300/18">
          Guardar entrenamiento
        </button>
        {feedback ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100">{feedback}</p> : null}
      </div>
    </article>
  );
}

function RecentTrainingSessions({ sessions }: { sessions: TrainingSession[] }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Historial reciente</p>
      <h2 className="mt-1 text-xl font-black text-white">Entrenamientos guardados</h2>
      <div className="mt-4 grid gap-3">
        {sessions.length === 0 ? (
          <EmptyState title="Sin entrenamientos" description="Cuando guardés una sesión manual, aparecerá aquí con duración y percepción." />
        ) : (
          sessions.slice(0, 5).map((session) => (
            <div key={session.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{session.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{formatFullDateLabel(session.startedAt)}</p>
                </div>
                <StatusBadge tone="info">{formatMinutes(session.durationMinutes)}</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-5 text-slate-400">{session.notes || 'Sin notas registradas.'}</p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
        <span className="text-cyan-100">{value}/5</span>
      </span>
      <input
        type="range"
        min="0"
        max="5"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-cyan-300"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/45 px-3 py-2">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}

function TimerButton({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-100 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
