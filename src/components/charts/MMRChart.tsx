import type { RankSnapshot } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { formatDateLabel, formatMMR, formatSignedNumber } from '../../lib/formatters';

function buildPoints(values: number[], width: number, height: number, padding: number) {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function MMRChart({ history }: { history: RankSnapshot[] }) {
  const sorted = [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const values = sorted.map((item) => item.mmr);
  const latest = sorted.at(-1);
  const first = sorted[0];
  const delta = latest && first ? latest.mmr - first.mmr : 0;
  const points = buildPoints(values, 720, 220, 28);
  const areaPoints = points ? `28,192 ${points} 692,192` : '';

  if (sorted.length < 2) {
    return <EmptyState title="Sin historial de MMR" description="Cuando registres partidas rankeds, acá aparecerá la tendencia de rango." />;
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Evolución MMR</p>
          <h2 className="mt-1 text-xl font-black text-white">{formatMMR(latest?.mmr ?? 0)}</h2>
        </div>
        <div className={`rounded-2xl border px-3 py-2 text-right ${delta >= 0 ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-orange-300/20 bg-orange-300/10 text-orange-100'}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">Delta</p>
          <p className="text-sm font-black">{formatSignedNumber(delta)}</p>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-white/8 bg-slate-950/40 p-2">
        <svg viewBox="0 0 720 220" role="img" aria-label="Gráfico de evolución de MMR" className="h-56 w-full">
          <defs>
            <linearGradient id="mmrArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(103,232,249,0.28)" />
              <stop offset="100%" stopColor="rgba(103,232,249,0.02)" />
            </linearGradient>
          </defs>
          {[52, 98, 144, 190].map((y) => (
            <line key={y} x1="28" x2="692" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          ))}
          <polygon points={areaPoints} fill="url(#mmrArea)" />
          <polyline points={points} fill="none" stroke="rgba(103,232,249,0.95)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.split(' ').map((point, index) => {
            const [x, y] = point.split(',');
            return <circle key={`${point}-${index}`} cx={x} cy={y} r="4" fill="rgb(103,232,249)" stroke="rgba(7,17,31,0.95)" strokeWidth="3" />;
          })}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
        <span>{formatDateLabel(first?.capturedAt ?? '')}</span>
        <span>{formatDateLabel(latest?.capturedAt ?? '')}</span>
      </div>
    </article>
  );
}
