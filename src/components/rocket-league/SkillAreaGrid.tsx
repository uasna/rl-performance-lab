import { formatPercent } from '../../lib/formatters';
import type { SkillArea, SkillMetric } from '../../types/rocketLeague';

interface SkillAreaGridProps {
  areas: SkillArea[];
  metrics: SkillMetric[];
}

export function SkillAreaGrid({ areas, metrics }: SkillAreaGridProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Áreas competitivas</p>
      <h2 className="mt-2 text-2xl font-black text-white">Métricas preparadas</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {areas.map((area) => {
          const areaMetrics = metrics.filter((metric) => metric.areaId === area.id);
          return (
            <article key={area.id} className="rounded-3xl border border-white/8 bg-white/[0.035] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-white">{area.name}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{area.description}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-slate-300">
                  {formatPercent(area.currentScore)}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {areaMetrics.length > 0 ? (
                  areaMetrics.map((metric) => (
                    <div key={metric.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm">
                      <span className="text-slate-400">{metric.label}</span>
                      <span className="font-black text-cyan-100">{metric.value}</span>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm text-slate-500">Sin métricas conectadas todavía.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
