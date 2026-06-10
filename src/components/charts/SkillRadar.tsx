import type { SkillArea } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';

function polarPoint(index: number, total: number, score: number, radius: number, center: number) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  const scaledRadius = (Math.max(0, Math.min(100, score)) / 100) * radius;
  return {
    x: center + Math.cos(angle) * scaledRadius,
    y: center + Math.sin(angle) * scaledRadius,
  };
}

export function SkillRadar({ areas }: { areas: SkillArea[] }) {
  if (areas.length === 0) {
    return <EmptyState title="Sin áreas de habilidad" description="Agregá áreas para visualizar tu perfil competitivo." />;
  }

  const center = 130;
  const radius = 92;
  const points = areas.map((area, index) => polarPoint(index, areas.length, area.currentScore, radius, center));
  const polygon = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Radar de habilidades</p>
          <h2 className="mt-1 text-xl font-black text-white">Perfil competitivo</h2>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr] lg:items-center">
        <div className="mx-auto overflow-hidden rounded-[1.25rem] border border-white/8 bg-slate-950/45 p-2">
          <svg viewBox="0 0 260 260" className="h-64 w-64" role="img" aria-label="Radar de habilidades">
            {[0.25, 0.5, 0.75, 1].map((scale) => (
              <circle key={scale} cx={center} cy={center} r={radius * scale} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            ))}
            {areas.map((area, index) => {
              const edge = polarPoint(index, areas.length, 100, radius, center);
              return <line key={area.id} x1={center} y1={center} x2={edge.x} y2={edge.y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />;
            })}
            <polygon points={polygon} fill="rgba(167,139,250,0.22)" stroke="rgba(167,139,250,0.95)" strokeWidth="3" strokeLinejoin="round" />
            {points.map((point, index) => (
              <circle key={areas[index].id} cx={point.x} cy={point.y} r="4" fill="rgb(167,139,250)" />
            ))}
          </svg>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {areas.map((area) => (
            <div key={area.id} className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-white">{area.name}</span>
                <span className="text-sm font-black text-cyan-100">{area.currentScore}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-cyan-200" style={{ width: `${Math.max(0, Math.min(100, area.currentScore))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
