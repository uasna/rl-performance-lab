import type { RocketLeagueMatch } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { MatchCard } from './MatchCard';

export function RecentMatches({ matches, selectedMatchId, onSelectMatch, limit }: { matches: RocketLeagueMatch[]; selectedMatchId?: string; onSelectMatch: (match: RocketLeagueMatch) => void; limit?: number }) {
  const visibleMatches = limit ? matches.slice(0, limit) : matches;

  if (visibleMatches.length === 0) {
    return <EmptyState title="Sin partidas registradas" description="Registrá tu primera partida para activar historial, win rate y diagnóstico competitivo." />;
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Partidas recientes</p>
          <h2 className="mt-1 text-xl font-black text-white">Últimos juegos</h2>
        </div>
        <p className="text-xs font-bold text-slate-500">{visibleMatches.length} visibles</p>
      </div>
      <div className="mt-4 grid gap-2">
        {visibleMatches.map((match) => (
          <MatchCard key={match.id} match={match} selected={selectedMatchId === match.id} onSelect={onSelectMatch} />
        ))}
      </div>
    </article>
  );
}
