import type { MatchEvent, RocketLeagueMatch } from '../../types/rocketLeague';
import { formatSecondsAsMinutes } from '../../lib/formatters';

const defaultDots = [
  { x: 28, y: 28, team: 'blue', label: '1' },
  { x: 42, y: 46, team: 'blue', label: '2' },
  { x: 62, y: 62, team: 'orange', label: '3' },
  { x: 72, y: 34, team: 'orange', label: '4' },
  { x: 51, y: 51, team: 'ball', label: '' },
];

function eventToPoint(event: MatchEvent, index: number, total: number) {
  const base = total <= 1 ? 50 : 18 + (64 * index) / Math.max(total - 1, 1);
  const isBlue = event.team === 'blue' || event.type === 'goal_for';
  return {
    x: Math.min(84, Math.max(16, base)),
    y: isBlue ? 34 + (index % 3) * 10 : 66 - (index % 3) * 10,
    team: isBlue ? 'blue' : 'orange',
    label: String(index + 1),
  };
}

export function AnalyzerFieldMap({ match, title = 'Mapa táctico', compact = false }: { match?: RocketLeagueMatch | null; title?: string; compact?: boolean }) {
  const goalEvents = match?.events?.filter((event) => event.type === 'goal_for' || event.type === 'goal_against').slice(0, 8) ?? [];
  const dots = goalEvents.length ? goalEvents.map((event, index) => eventToPoint(event, index, goalEvents.length)) : defaultDots;

  return (
    <article className={`analyzer-card overflow-hidden ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-kicker">Concept map</p>
          <h3 className="mt-1 text-lg font-black text-white">{title}</h3>
        </div>
        {match ? <span className="analyzer-pill cyan">{match.score.blue}-{match.score.orange}</span> : <span className="analyzer-pill">Simulación</span>}
      </div>

      <div className={`${compact ? 'mt-3 h-[230px]' : 'mt-4 h-[320px]'} relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#071321] shadow-inner shadow-black/40`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(103,232,249,0.13),transparent_34%),linear-gradient(90deg,rgba(34,211,238,0.10)_0%,rgba(34,211,238,0.04)_50%,rgba(251,146,60,0.08)_100%)]" />
        <div className="absolute inset-[7%] rounded-[18%] border border-cyan-200/16" />
        <div className="absolute left-1/2 top-[7%] h-[86%] w-px bg-white/10" />
        <div className="absolute left-[8%] top-1/2 h-px w-[84%] bg-white/10" />
        <div className="absolute left-[10%] top-[31%] h-[38%] w-[18%] rounded-r-[2rem] border border-cyan-200/18 bg-cyan-300/[0.035]" />
        <div className="absolute right-[10%] top-[31%] h-[38%] w-[18%] rounded-l-[2rem] border border-orange-200/18 bg-orange-300/[0.035]" />
        <div className="absolute left-[45%] top-[42%] h-[16%] w-[10%] rounded-full border border-white/12" />

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d="M 18 73 C 28 55, 39 65, 48 49 S 70 35, 82 22" fill="none" stroke="rgba(103,232,249,0.42)" strokeWidth="0.5" strokeDasharray="1.6 1.2" />
          <path d="M 80 75 C 70 60, 60 66, 52 52 S 35 42, 20 28" fill="none" stroke="rgba(251,146,60,0.34)" strokeWidth="0.5" strokeDasharray="1.6 1.2" />
        </svg>

        {dots.map((dot, index) => {
          const tone = dot.team === 'blue' ? 'bg-cyan-300 shadow-cyan-300/60' : dot.team === 'orange' ? 'bg-orange-300 shadow-orange-300/60' : 'bg-white shadow-white/60';
          return (
            <div key={`${dot.x}-${dot.y}-${index}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${dot.x}%`, top: `${dot.y}%` }}>
              <span className={`grid h-4 w-4 place-items-center rounded-full ${tone} text-[9px] font-black text-slate-950 shadow-[0_0_18px]`}>{dot.label}</span>
            </div>
          );
        })}
      </div>

      {goalEvents.length ? (
        <div className="mt-3 grid gap-2">
          {goalEvents.slice(0, 4).map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-bold text-slate-300">
              <span>{event.description}</span>
              <span className="text-cyan-100">{formatSecondsAsMinutes(event.timestampSecond)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
