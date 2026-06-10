import type { DailyProgress } from '../../types/rocketLeague';
import { formatDateLabel, formatMinutes, formatSignedNumber } from '../../lib/formatters';
import { EmptyState } from '../cards/EmptyState';

export function ProgressChart({ progress, title = 'Progreso' }: { progress: DailyProgress[]; title?: string }) {
  const days = [...progress].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-10);
  const maxTraining = Math.max(1, ...days.map((day) => day.trainingMinutes));
  const maxMatches = Math.max(1, ...days.map((day) => day.playedMatches));

  if (days.length === 0) {
    return <EmptyState title="Sin progreso registrado" description="Al registrar entrenamiento o partidas se llenará esta gráfica." />;
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">{title}</p>
      <h2 className="mt-1 text-xl font-black text-white">Entrenamiento + partidas</h2>
      <div className="mt-5 space-y-3">
        {days.map((day) => (
          <div key={day.id} className="grid gap-2 rounded-2xl border border-white/8 bg-slate-950/38 p-3 sm:grid-cols-[86px_1fr_88px] sm:items-center">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{formatDateLabel(day.date)}</span>
            <div className="grid gap-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-cyan-200" style={{ width: `${Math.min(100, (day.trainingMinutes / maxTraining) * 100)}%` }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-violet-300" style={{ width: `${Math.min(100, (day.playedMatches / maxMatches) * 100)}%` }} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400 sm:block sm:text-right">
              <span>{formatMinutes(day.trainingMinutes)}</span>
              <span className={day.mmrDelta >= 0 ? 'text-emerald-100' : 'text-orange-100'}>{formatSignedNumber(day.mmrDelta)}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
