import type { SkillArea, SkillMetric } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { formatMinutes, formatPercent } from '../../lib/formatters';

export function SkillAreaPanel({ area, metrics }: { area: SkillArea; metrics: SkillMetric[] }) {
  const areaMetrics = metrics.filter((metric) => metric.areaId === area.id);
  const tone = area.isStrongArea ? 'improvement' : area.isWeakArea ? 'warning' : 'neutral';

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">{area.name}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-400">{area.description}</p>
        </div>
        <StatusBadge tone={tone}>{area.isStrongArea ? 'fuerte' : area.isWeakArea ? 'débil' : 'neutro'}</StatusBadge>
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Score actual</p>
          <p className="text-4xl font-black text-white">{area.currentScore}</p>
        </div>
        <p className="pb-1 text-sm font-black text-cyan-100">Meta {area.targetScore}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-cyan-200" style={{ width: `${Math.max(0, Math.min(100, area.currentScore))}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <SmallMetric label="Minutos" value={formatMinutes(area.recommendedMinutes)} />
        <SmallMetric label="Categoría" value={area.category} />
        {areaMetrics.slice(0, 2).map((metric) => (
          <SmallMetric key={metric.id} label={metric.label} value={metric.unit === 'porcentaje' ? formatPercent(metric.value) : metric.value} />
        ))}
      </div>
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/38 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
    </div>
  );
}
