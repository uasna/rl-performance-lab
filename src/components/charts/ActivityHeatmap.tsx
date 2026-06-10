import type { DailyProgress } from '../../types/rocketLeague';
import { formatDateLabel } from '../../lib/formatters';

function intensity(day: DailyProgress) {
  const score = day.trainingMinutes / 90 + day.playedMatches / 5 + day.completedBlocks / Math.max(1, day.totalBlocks);
  if (score >= 2.2) return 'bg-emerald-300/85 border-emerald-200/30';
  if (score >= 1.5) return 'bg-cyan-300/65 border-cyan-200/30';
  if (score >= 0.7) return 'bg-violet-300/45 border-violet-200/20';
  if (score > 0) return 'bg-slate-500/35 border-white/10';
  return 'bg-slate-900/90 border-white/6';
}

export function ActivityHeatmap({ progress }: { progress: DailyProgress[] }) {
  const days = [...progress].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-35);

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Actividad</p>
          <h2 className="mt-1 text-xl font-black text-white">Ritmo reciente</h2>
        </div>
        <p className="text-xs font-bold text-slate-500">{days.length} días</p>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2">
        {days.map((day) => (
          <div
            key={day.id}
            title={`${day.date}: ${day.trainingMinutes} min · ${day.playedMatches} partidas`}
            className={`aspect-square rounded-lg border ${intensity(day)}`}
            aria-label={`${formatDateLabel(day.date)} actividad`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-500">
        <span>Bajo</span>
        <span>Alto</span>
      </div>
    </article>
  );
}
