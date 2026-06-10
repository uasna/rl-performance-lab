import type { FrequentError } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { StatusBadge } from '../cards/StatusBadge';

function severityTone(severity: FrequentError['severity']) {
  if (severity === 'critica') return 'decline';
  if (severity === 'alta') return 'warning';
  if (severity === 'media') return 'violet';
  return 'neutral';
}

export function ErrorFrequencyTable({ errors }: { errors: FrequentError[] }) {
  const sorted = [...errors].sort((a, b) => b.appearances - a.appearances || b.impactScore - a.impactScore);

  if (sorted.length === 0) {
    return <EmptyState title="Sin errores frecuentes" description="Cuando registres patrones, la tabla priorizará el error que más afecta tu rendimiento." />;
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-100/60">Errores frecuentes</p>
          <h2 className="mt-1 text-xl font-black text-white">Prioridad táctica</h2>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-white/8">
        <div className="hidden grid-cols-[1fr_90px_90px_120px] gap-3 border-b border-white/8 bg-slate-950/50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 md:grid">
          <span>Error</span>
          <span>Apar.</span>
          <span>Impacto</span>
          <span>Severidad</span>
        </div>
        <div className="divide-y divide-white/8">
          {sorted.map((error) => (
            <div key={error.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_90px_90px_120px] md:items-center">
              <div>
                <p className="font-black text-white">{error.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-400">{error.suggestedFix}</p>
              </div>
              <p className="text-sm font-black text-slate-200">{error.appearances}</p>
              <p className="text-sm font-black text-slate-200">{error.impactScore}</p>
              <StatusBadge tone={severityTone(error.severity)}>{error.severity}</StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
