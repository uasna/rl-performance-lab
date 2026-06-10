import type { TrainingBlock } from '../../types/rocketLeague';
import { formatMinutes } from '../../lib/formatters';
import { StatusBadge } from './StatusBadge';

export function TrainingBlockCard({ block }: { block: TrainingBlock }) {
  const progress = block.targetRepetitions > 0 ? Math.round((block.completedRepetitions / block.targetRepetitions) * 100) : 0;
  const tone = block.status === 'completado' ? 'improvement' : block.status === 'omitido' ? 'warning' : 'neutral';

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white">{block.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-400">{block.description}</p>
        </div>
        <StatusBadge tone={tone}>{block.status}</StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Info label="Tiempo" value={formatMinutes(block.durationMinutes)} />
        <Info label="Reps" value={`${block.completedRepetitions}/${block.targetRepetitions}`} />
        <Info label="Pack" value={block.trainingPackCode} />
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
    </article>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/38 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}
