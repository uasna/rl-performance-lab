import type { RankSnapshot } from '../../types/rocketLeague';
import { formatMMR } from '../../lib/formatters';

function fallbackValues() {
  return [0, 12, -5, 28, 34, 26, 42, 60, 55, 74, 68, 82, 78, 91, 86, 100];
}

function buildPath(values: number[], width = 100, height = 46) {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 6) - 3;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function AnalyzerWaveChart({ history, currentMmr }: { history: RankSnapshot[]; currentMmr: number }) {
  const values = history.length >= 2 ? history.slice(-16).map((item) => item.mmr) : fallbackValues();
  const path = buildPath(values);
  const area = `${path} L 100 48 L 0 48 Z`;

  return (
    <article className="analyzer-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">MMR progression</p>
          <h3 className="mt-1 text-2xl font-black text-white">{formatMMR(currentMmr)}</h3>
          <p className="text-xs font-bold text-slate-500">Curva de sesión / semana</p>
        </div>
        <span className="analyzer-pill violet">Live graph</span>
      </div>
      <div className="relative mt-5 h-[210px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#080f1e]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[length:100%_25%,12.5%_100%]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mmrFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(192,132,252,.42)" />
              <stop offset="0.5" stopColor="rgba(34,211,238,.20)" />
              <stop offset="1" stopColor="rgba(2,6,23,0)" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#mmrFill)" />
          <path d={path} fill="none" stroke="rgba(216,180,254,.94)" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
          <path d="M 0 27 L 100 27" stroke="rgba(34,211,238,.22)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
        </svg>
      </div>
    </article>
  );
}
