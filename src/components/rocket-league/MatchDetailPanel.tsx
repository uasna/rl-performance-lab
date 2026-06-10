import type { RocketLeagueMatch } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import { formatDateLabel, formatMMR, formatPercent, formatSecondsAsMinutes, formatSignedNumber, resultLabel } from '../../lib/formatters';

function resultTone(result: RocketLeagueMatch['result']) {
  if (result === 'victoria') return 'win';
  if (result === 'derrota') return 'loss';
  return 'neutral';
}

export function MatchDetailPanel({ match }: { match: RocketLeagueMatch | null }) {
  if (!match) {
    return <EmptyState title="Seleccioná una partida" description="El detalle muestra marcador, MMR, eventos y métricas de rendimiento del match." />;
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Detalle de partida</p>
          <h2 className="mt-1 text-2xl font-black text-white">{match.mapName}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{formatDateLabel(match.playedAt)} · {match.playlist} · {formatSecondsAsMinutes(match.durationSeconds)}</p>
        </div>
        <StatusBadge tone={resultTone(match.result)}>{resultLabel(match.result)}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Marcador" value={`${match.score.blue}–${match.score.orange}`} />
        <Metric label="MMR" value={formatMMR(match.rankSnapshot.mmr)} helper={formatSignedNumber(match.rankSnapshot.mmrDelta)} />
        <Metric label="Precisión" value={formatPercent(match.performance.shootingAccuracy)} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Goles" value={match.playerStats.goals} />
        <Metric label="Asistencias" value={match.playerStats.assists} />
        <Metric label="Salvadas" value={match.playerStats.saves} />
        <Metric label="Overcommit" value={match.performance.overcommitCount} tone="warning" />
      </div>

      <section className="mt-5 rounded-[1.25rem] border border-white/8 bg-slate-950/38 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Qué pasó</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{match.notes || 'Sin notas registradas.'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {match.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
      </section>

      <section className="mt-4 rounded-[1.25rem] border border-white/8 bg-slate-950/38 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Eventos clave</p>
        <div className="mt-3 space-y-2">
          {match.events.length === 0 ? <p className="text-sm text-slate-500">Sin eventos del match.</p> : match.events.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-sm leading-5 text-slate-300">{event.description}</p>
              <span className="text-xs font-black text-cyan-100">{Math.floor(event.timestampSecond / 60)}:{String(event.timestampSecond % 60).padStart(2, '0')}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function Metric({ label, value, helper, tone = 'neutral' }: { label: string; value: string | number; helper?: string; tone?: 'neutral' | 'warning' }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === 'warning' ? 'border-amber-300/20 bg-amber-300/10' : 'border-white/8 bg-slate-950/38'}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
      {helper ? <p className="mt-1 text-xs font-bold text-slate-400">{helper}</p> : null}
    </div>
  );
}
