import { formatMMR, formatSecondsAsMinutes, resultLabel } from '../../lib/formatters';
import type { RocketLeagueMatch } from '../../types/rocketLeague';

interface MatchTableProps {
  matches: RocketLeagueMatch[];
}

export function MatchTable({ matches }: MatchTableProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Partidas recientes</p>
          <h2 className="mt-2 text-2xl font-black text-white">Historial base</h2>
        </div>
        <p className="text-sm text-slate-500">Datos simulados persistibles</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-white/8">
        <div className="hidden grid-cols-[1.2fr_.7fr_.8fr_.7fr_.7fr] border-b border-white/8 bg-white/[0.035] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:grid">
          <span>Mapa</span>
          <span>Modo</span>
          <span>Resultado</span>
          <span>Marcador</span>
          <span>MMR</span>
        </div>
        <div className="divide-y divide-white/8">
          {matches.map((match) => (
            <article key={match.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_.7fr_.8fr_.7fr_.7fr] md:items-center">
              <div>
                <p className="font-bold text-white">{match.mapName}</p>
                <p className="text-sm text-slate-500">Duración {formatSecondsAsMinutes(match.durationSeconds)}</p>
              </div>
              <p className="text-sm font-semibold text-slate-300">{match.mode}</p>
              <p className="text-sm font-semibold text-slate-300">{resultLabel(match.result)}</p>
              <p className="text-sm font-black text-white">{match.score.blue}-{match.score.orange}</p>
              <p className="text-sm font-semibold text-cyan-100">{formatMMR(match.rankSnapshot.mmr)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
