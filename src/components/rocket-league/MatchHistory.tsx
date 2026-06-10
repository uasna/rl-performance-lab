/* eslint-disable react-refresh/only-export-components */
import type { ChangeEvent, ReactNode } from 'react';
import type { GameMode, MatchResult, MatchType, RocketLeagueMatch, SkillArea, SkillAreaId } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import { formatFullDateLabel, formatMMR, formatShortDateInput, formatSignedNumber, matchTypeLabel, resultLabel } from '../../lib/formatters';

type ResultFilter = 'all' | 'victoria' | 'derrota';

export interface MatchHistoryFiltersState {
  mode: 'all' | Extract<GameMode, '1v1' | '2v2' | '3v3'>;
  result: ResultFilter;
  date: string;
  error: string;
  area: 'all' | SkillAreaId;
}

export const defaultMatchHistoryFilters: MatchHistoryFiltersState = {
  mode: 'all',
  result: 'all',
  date: '',
  error: 'all',
  area: 'all',
};

function resultTone(result: MatchResult) {
  if (result === 'victoria') return 'win';
  if (result === 'derrota') return 'loss';
  return 'neutral';
}

export function filterMatches(matches: RocketLeagueMatch[], filters: MatchHistoryFiltersState): RocketLeagueMatch[] {
  return matches.filter((match) => {
    if (filters.mode !== 'all' && match.mode !== filters.mode) return false;
    if (filters.result !== 'all' && match.result !== filters.result) return false;
    if (filters.date && formatShortDateInput(match.playedAt) !== filters.date) return false;
    if (filters.error !== 'all' && match.mainErrorId !== filters.error) return false;
    if (filters.area !== 'all' && match.affectedAreaId !== filters.area && match.recommendedFocusAreaId !== filters.area) return false;
    return true;
  });
}

export function MatchHistory({
  matches,
  skillAreas,
  selectedMatchId,
  filters,
  onChangeFilters,
  onResetFilters,
  onSelectMatch,
}: {
  matches: RocketLeagueMatch[];
  skillAreas: SkillArea[];
  selectedMatchId?: string;
  filters: MatchHistoryFiltersState;
  onChangeFilters: (nextFilters: MatchHistoryFiltersState) => void;
  onResetFilters: () => void;
  onSelectMatch: (match: RocketLeagueMatch) => void;
}) {
  const filteredMatches = filterMatches(matches, filters);
  const errorOptions = Array.from(new Map(matches.filter((match) => match.mainErrorId).map((match) => [match.mainErrorId, match.mainErrorTitle ?? match.mainErrorId])).entries());

  function updateFilter<Key extends keyof MatchHistoryFiltersState>(key: Key, value: MatchHistoryFiltersState[Key]) {
    onChangeFilters({ ...filters, [key]: value });
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Match History</p>
            <h2 className="mt-1 text-2xl font-black text-white">Historial de partidas</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Filtrá por modo, resultado, fecha, error o área afectada.</p>
          </div>
          <StatusBadge tone="info">{filteredMatches.length}/{matches.length} visibles</StatusBadge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SelectControl label="Modo" value={filters.mode} onChange={(event) => updateFilter('mode', event.target.value as MatchHistoryFiltersState['mode'])}>
            <option value="all">Todos</option>
            <option value="1v1">1v1</option>
            <option value="2v2">2v2</option>
            <option value="3v3">3v3</option>
          </SelectControl>
          <SelectControl label="Resultado" value={filters.result} onChange={(event) => updateFilter('result', event.target.value as ResultFilter)}>
            <option value="all">Todos</option>
            <option value="victoria">Win</option>
            <option value="derrota">Loss</option>
          </SelectControl>
          <label className="grid gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Fecha</span>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => updateFilter('date', event.target.value)}
              className="h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-bold text-slate-100 outline-none transition focus:border-cyan-300/45"
            />
          </label>
          <SelectControl label="Error" value={filters.error} onChange={(event) => updateFilter('error', event.target.value)}>
            <option value="all">Todos</option>
            {errorOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </SelectControl>
          <SelectControl label="Área" value={filters.area} onChange={(event) => updateFilter('area', event.target.value as MatchHistoryFiltersState['area'])}>
            <option value="all">Todas</option>
            {skillAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </SelectControl>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onResetFilters} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/[0.07]">
            Limpiar filtros
          </button>
          <Tag>Ranked</Tag>
          <Tag>Replay Review</Tag>
          <Tag>Overcommit</Tag>
        </div>
      </div>

      <div className="grid gap-3">
        {filteredMatches.length === 0 ? (
          <EmptyState title="Sin partidas con esos filtros" description="Cuando registres o importes partidas, aparecerán aquí con su análisis básico y foco recomendado." />
        ) : (
          filteredMatches.map((match) => (
            <MatchHistoryCard key={match.id} match={match} selected={selectedMatchId === match.id} onSelect={onSelectMatch} />
          ))
        )}
      </div>
    </section>
  );
}

function SelectControl({ label, value, onChange, children }: { label: string; value: string; onChange: (event: ChangeEvent<HTMLSelectElement>) => void; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={onChange} className="h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-bold text-slate-100 outline-none transition focus:border-cyan-300/45">
        {children}
      </select>
    </label>
  );
}

function MatchHistoryCard({ match, selected, onSelect }: { match: RocketLeagueMatch; selected: boolean; onSelect: (match: RocketLeagueMatch) => void }) {
  const mmrBefore = match.mmrBefore ?? match.rankSnapshot.mmr - match.rankSnapshot.mmrDelta;
  const mmrAfter = match.mmrAfter ?? match.rankSnapshot.mmr;

  return (
    <button
      type="button"
      onClick={() => onSelect(match)}
      className={`w-full rounded-[1.35rem] border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${selected ? 'border-cyan-300/38 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.035] hover:border-white/18 hover:bg-white/[0.055]'}`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={resultTone(match.result)}>{resultLabel(match.result)}</StatusBadge>
            <StatusBadge tone="neutral">{match.mode}</StatusBadge>
            <StatusBadge tone="violet">{matchTypeLabel(match.matchType as MatchType | undefined)}</StatusBadge>
          </div>
          <h3 className="mt-3 text-xl font-black text-white">{match.mapName}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{formatFullDateLabel(match.playedAt)} · {match.playlist}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <MiniStat label="Marcador" value={`${match.score.blue}-${match.score.orange}`} />
          <MiniStat label="MMR" value={`${formatMMR(mmrBefore)} → ${formatMMR(mmrAfter)}`} />
          <MiniStat label="Delta" value={formatSignedNumber(match.rankSnapshot.mmrDelta)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="Goles" value={match.playerStats.goals} />
        <MiniStat label="Asist." value={match.playerStats.assists} />
        <MiniStat label="Salvadas" value={match.playerStats.saves} />
        <MiniStat label="Tiros" value={match.playerStats.shots} />
        <MiniStat label="Demos" value={match.playerStats.demos} />
        <MiniStat label="Error" value={match.mainErrorTitle ?? 'Sin error'} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-white/8 bg-slate-950/34 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Observación rápida</p>
          <p className="mt-1 text-sm leading-5 text-slate-300">{match.quickObservation ?? match.notes}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.06] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/60">Foco recomendado</p>
          <p className="mt-1 text-sm font-black text-cyan-50">{match.recommendedFocus ?? 'Registrar foco después del review.'}</p>
        </div>
      </div>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/8 bg-slate-950/35 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums text-white">{value}</p>
    </div>
  );
}
