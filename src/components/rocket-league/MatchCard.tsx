import type { RocketLeagueMatch } from '../../types/rocketLeague';
import { formatDateLabel, formatSecondsAsMinutes, resultLabel } from '../../lib/formatters';
import { StatusBadge } from '../cards/StatusBadge';

function resultTone(result: RocketLeagueMatch['result']) {
  if (result === 'victoria') return 'win';
  if (result === 'derrota') return 'loss';
  return 'neutral';
}

export function MatchCard({ match, selected = false, onSelect }: { match: RocketLeagueMatch; selected?: boolean; onSelect?: (match: RocketLeagueMatch) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(match)}
      className={`w-full rounded-[1.25rem] border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${
        selected ? 'border-cyan-300/38 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.035] hover:border-white/18 hover:bg-white/[0.055]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{match.mapName}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateLabel(match.playedAt)} · {match.mode} · {formatSecondsAsMinutes(match.durationSeconds)}</p>
        </div>
        <StatusBadge tone={resultTone(match.result)}>{resultLabel(match.result)}</StatusBadge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-2xl font-black tabular-nums text-white">{match.score.blue}–{match.score.orange}</span>
        <span className="text-xs font-bold text-slate-500">{match.playerStats.goals}G · {match.playerStats.saves}S · {match.playerStats.shots}T</span>
      </div>
    </button>
  );
}
