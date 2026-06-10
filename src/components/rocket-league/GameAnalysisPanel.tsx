import { useEffect, useState } from 'react';
import type { MatchEvent, MatchPlayerStat, RocketLeagueMatch, SkillArea, SkillAreaId, TeamColor } from '../../types/rocketLeague';
import { EmptyState } from '../cards/EmptyState';
import { StatusBadge } from '../cards/StatusBadge';
import { ReplayFieldView } from './TacticalPlayback';
import { formatFullDateLabel, formatMMR, formatPercent, formatSecondsAsMinutes, formatSignedNumber, resultLabel } from '../../lib/formatters';

const skillOrder: SkillAreaId[] = ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'];
type AnalysisTab = 'overview' | 'movement' | 'boost' | 'offence' | 'defence' | 'kickoffs' | 'duels';
const tabs: Array<{ id: AnalysisTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'movement', label: 'Movement' },
  { id: 'boost', label: 'Boost' },
  { id: 'offence', label: 'Offence' },
  { id: 'defence', label: 'Defence' },
  { id: 'kickoffs', label: 'Kickoffs' },
  { id: 'duels', label: 'Touches & Duels' },
];

function resultTone(result: RocketLeagueMatch['result']) {
  if (result === 'victoria') return 'win';
  if (result === 'derrota') return 'loss';
  return 'neutral';
}

function eventLabel(type: MatchEvent['type']): string {
  const labels: Record<MatchEvent['type'], string> = {
    goal_for: 'Gol a favor', goal_against: 'Gol en contra', save: 'Save', shot: 'Tiro', assist: 'Asistencia', demo: 'Demo', miss: 'Miss', overcommit: 'Overcommit', bad_challenge: 'Bad challenge', boost_starvation: 'Boost starvation', mistake: 'Error', rotation: 'Rotación', boost_pickup: 'Boost pickup',
  };
  return labels[type];
}

function teamLabel(team: TeamColor): string {
  if (team === 'blue') return 'Blue';
  if (team === 'orange') return 'Orange';
  return 'Neutral';
}

function teamClass(team: TeamColor): string {
  if (team === 'orange') return 'orange';
  if (team === 'blue') return 'blue';
  return 'neutral';
}

export function GameAnalysisPanel({ match, skillAreas }: { match: RocketLeagueMatch | null; skillAreas: SkillArea[] }) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [fieldFilter, setFieldFilter] = useState<'me' | 'team' | 'all'>('team');


  useEffect(() => {
    if (!isPlaying) return undefined;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(80, now - last);
      last = now;
      setPlayhead((current) => {
        const next = current + delta / 22000;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [isPlaying]);

  const seekPlayback = (next: number) => {
    setPlayhead(Math.max(0, Math.min(1, next)));
  };

  if (!match) {
    return <EmptyState title="Seleccioná una partida" description="El análisis individual mostrará marcador, timeline, jugadores, métricas por área y mapa táctico." />;
  }

  const metrics = match.personalMetrics ?? { movement: 0, boost: 0, offence: 0, defence: 0, rotation: 0, positioning: 0 };
  const mmrBefore = match.mmrBefore ?? match.rankSnapshot.mmr - match.rankSnapshot.mmrDelta;
  const mmrAfter = match.mmrAfter ?? match.rankSnapshot.mmr;
  const goalEvents = match.events.filter((event) => event.type === 'goal_for' || event.type === 'goal_against');
  const keyEvents = match.events.filter((event) => ['goal_for', 'goal_against', 'save', 'shot', 'assist', 'miss', 'overcommit', 'bad_challenge'].includes(event.type));

  return (
    <section className="exact-game-analysis">
      <article className="exact-game-hero analyzer-card">
        <div className="exact-game-hero__bg" />
        <div className="exact-game-hero__content">
          <div className="exact-game-left">
            <p className="section-kicker">Game analysis</p>
            <h2>{match.mapName || 'Arena no detectada'}</h2>
            <span>{formatFullDateLabel(match.playedAt)} · {match.playlist} · {match.mode} · {formatSecondsAsMinutes(match.durationSeconds)}</span>
          </div>
          <div className="exact-scoreboard">
            <StatusBadge tone={resultTone(match.result)}>{resultLabel(match.result)}</StatusBadge>
            <div><b className="blue">{match.score.blue}</b><em>—</em><b className="orange">{match.score.orange}</b></div>
            <span>Blue vs Orange</span>
          </div>
        </div>
      </article>

      <nav className="exact-game-tabs" aria-label="Game analysis tabs">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? 'is-active' : ''}>{tab.label}</button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <OverviewTab match={match} players={match.players ?? []} metrics={metrics} skillAreas={skillAreas} keyEvents={keyEvents} goalEvents={goalEvents} mmrBefore={mmrBefore} mmrAfter={mmrAfter} />
      ) : activeTab === 'movement' ? (
        <MovementTab match={match} metrics={metrics} players={match.players ?? []} />
      ) : (
        <PillarTab tab={activeTab} match={match} metrics={metrics} skillAreas={skillAreas} keyEvents={keyEvents} playhead={playhead} isPlaying={isPlaying} fieldFilter={fieldFilter} onTogglePlayback={() => {
        if (playhead >= 1) setPlayhead(0);
        setIsPlaying((value) => !value);
      }} onSeek={seekPlayback} onFieldFilterChange={setFieldFilter} />
      )}
    </section>
  );
}

function OverviewTab({ match, players, metrics, skillAreas, keyEvents, goalEvents, mmrBefore, mmrAfter }: { match: RocketLeagueMatch; players: MatchPlayerStat[]; metrics: Partial<Record<SkillAreaId, number>>; skillAreas: SkillArea[]; keyEvents: MatchEvent[]; goalEvents: MatchEvent[]; mmrBefore: number; mmrAfter: number }) {
  return (
    <div className="exact-game-overview">
      <PlayersTable players={players} />
      <BestPerformers players={players} metrics={metrics} />

      <section className="analyzer-card exact-scoreline-card wide">
        <div className="analysis-panel-title"><div><p className="section-kicker">Score timeline</p><h3>Blue pressure / Orange pressure</h3></div><span className="analyzer-pill cyan">{goalEvents.length} goals</span></div>
        <ScoreTimeline match={match} goalEvents={goalEvents} />
      </section>

      <section className="exact-game-stat-strip">
        <HeroStat label="MMR before" value={formatMMR(mmrBefore)} />
        <HeroStat label="MMR after" value={formatMMR(mmrAfter)} />
        <HeroStat label="Delta" value={formatSignedNumber(match.rankSnapshot.mmrDelta)} />
        <HeroStat label="Accuracy" value={formatPercent(match.performance.shootingAccuracy)} />
        <HeroStat label="Score" value={match.playerStats.score} />
      </section>

      <section className="exact-game-dual">
        <AreaMetrics metrics={metrics} skillAreas={skillAreas} />
        <KeyEvents events={keyEvents} />
      </section>

      <section className="exact-game-learning">
        <AnalysisCard title="Error summary" value={match.mainErrorTitle ?? 'No critical error'} body={match.notes || match.quickObservation || 'No critical error detected with the current data.'} tone="orange" />
        <AnalysisCard title="Match lesson" value="What to adjust" body={match.lesson ?? 'Review goals, saves and pressure during key moments.'} tone="cyan" />
        <AnalysisCard title="Next action" value="Concrete training" body={match.nextTrainingAction ?? 'Use the coach focus and repeat it in the next session.'} tone="emerald" />
      </section>
    </div>
  );
}

function BestPerformers({ players, metrics }: { players: MatchPlayerStat[]; metrics: Partial<Record<SkillAreaId, number>> }) {
  const best = players.length ? [...players].sort((a, b) => b.score - a.score)[0] : null;
  const blocks: Array<{ label: string; value: number; name: string }> = [
    { label: 'Movement', value: metrics.movement ?? 0, name: best?.playerName ?? 'Pending' },
    { label: 'Boost', value: metrics.boost ?? 0, name: best?.playerName ?? 'Pending' },
    { label: 'Offence', value: metrics.offence ?? 0, name: best?.playerName ?? 'Pending' },
    { label: 'Defence', value: metrics.defence ?? 0, name: best?.playerName ?? 'Pending' },
    { label: 'Rotation', value: metrics.rotation ?? 0, name: best?.playerName ?? 'Pending' },
  ];
  return (
    <section className="exact-best-strip">
      {blocks.map((block) => (
        <article key={block.label} className="analyzer-card">
          <span>{block.label}</span>
          <strong>{Math.round(block.value || best?.score || 0)}<em>/100</em></strong>
          <small>{block.name}</small>
        </article>
      ))}
      <article className="analyzer-card exact-mvp-card"><span>MVP</span><strong>{best?.playerName ?? 'Pending'}</strong></article>
    </section>
  );
}

function MovementTab({ metrics, players }: { match: RocketLeagueMatch; metrics: Partial<Record<SkillAreaId, number>>; players: MatchPlayerStat[] }) {
  return (
    <div className="exact-movement-tab">
      <article className="analyzer-card exact-movement-summary">
        <div><p className="section-kicker">Movement</p><h3>{Math.round(metrics.movement ?? 0)}</h3><span>#3/4 in match</span></div>
        <ExactHorizontalBars players={players} />
      </article>
      <MovementMetricTable players={players} />
      <article className="analyzer-card exact-field-zones"><p className="section-kicker">Blue team</p><FieldHeatMap side="blue" /></article>
      <article className="analyzer-card exact-field-zones"><p className="section-kicker">Orange team</p><FieldHeatMap side="orange" /></article>
    </div>
  );
}

function MovementMetricTable({ players }: { players: MatchPlayerStat[] }) {
  const rows = [
    ['Avg speed', '53', '55', '50'],
    ['Supersonic', '8.5%', '15.2%', '6.5%'],
    ['Stopped', '2.0%', '29.0%', '10.0%'],
    ['Defending', '38.4%', '37.2%', '51.7%'],
    ['Neutral', '35.6%', '34.3%', '31.3%'],
    ['Attacking', '26.1%', '28.5%', '17.3%'],
    ['Ground', '58.6%', '62.7%', '66.5%'],
    ['Low Air', '33.2%', '26.7%', '27.9%'],
    ['High Air', '2.1%', '4.3%', '1.4%'],
    ['Wall', '6.0%', '6.3%', '4.1%'],
  ];
  const names = players.slice(0, 3).map((p) => p.playerName);
  while (names.length < 3) names.push('Player');
  return (
    <article className="analyzer-card exact-movement-table">
      <table>
        <thead><tr><th>Speed</th>{names.map((name, index) => <th key={`${name}-${index}`}>{name}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={cell}>{cell}</th> : <td key={`${row[0]}-${cell}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </article>
  );
}

function PillarTab({
  tab,
  match,
  metrics,
  skillAreas,
  keyEvents,
  playhead,
  isPlaying,
  fieldFilter,
  onTogglePlayback,
  onSeek,
  onFieldFilterChange,
}: {
  tab: AnalysisTab;
  match: RocketLeagueMatch;
  metrics: Partial<Record<SkillAreaId, number>>;
  skillAreas: SkillArea[];
  keyEvents: MatchEvent[];
  playhead: number;
  isPlaying: boolean;
  fieldFilter: 'me' | 'team' | 'all';
  onTogglePlayback: () => void;
  onSeek: (next: number) => void;
  onFieldFilterChange: (filter: 'me' | 'team' | 'all') => void;
}) {
  const id = tab === 'duels' || tab === 'kickoffs' ? 'positioning' : tab;
  const areaId = id as SkillAreaId;
  const value = metrics[areaId] ?? skillAreas.find((area) => area.id === areaId)?.currentScore ?? 0;
  return (
    <div className="exact-pillar-tab">
      <section className="analyzer-card exact-scoreline-card"><div className="analysis-panel-title"><div><p className="section-kicker">{tab}</p><h3>{Math.round(value)}/100</h3></div><span className="analyzer-pill violet">pillar model</span></div><MiniTrend value={value || 52} /></section>
      <article className="analyzer-card exact-field-large"><p className="section-kicker">Replay field view</p><ReplayFieldView match={match} events={keyEvents} playhead={playhead} isPlaying={isPlaying} filter={fieldFilter} onTogglePlayback={onTogglePlayback} onSeek={onSeek} onFilterChange={onFieldFilterChange} /></article>
      <AreaMetrics metrics={metrics} skillAreas={skillAreas} />
      <KeyEvents events={keyEvents} />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string | number }) {
  return <div className="hero-stat exact-hero-stat"><span>{label}</span><strong>{value}</strong></div>;
}

function ScoreTimeline({ match, goalEvents }: { match: RocketLeagueMatch; goalEvents: MatchEvent[] }) {
  const blueScoreAt = (time: number) => goalEvents.filter((event) => event.team === 'blue' && event.timestampSecond <= time).length;
  const orangeScoreAt = (time: number) => goalEvents.filter((event) => event.team === 'orange' && event.timestampSecond <= time).length;
  const samples = Array.from({ length: 18 }, (_, index) => (index / 17) * match.durationSeconds);
  const bluePoints = samples.map((time, index) => `${(index / 17) * 100},${70 - blueScoreAt(time) * 12}`).join(' ');
  const orangePoints = samples.map((time, index) => `${(index / 17) * 100},${78 - orangeScoreAt(time) * 12}`).join(' ');
  return (
    <div className="exact-score-timeline">
      <svg viewBox="0 0 100 88" preserveAspectRatio="none">
        {[20, 40, 60, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,.08)" />)}
        <polyline points={bluePoints} fill="none" stroke="rgba(0,229,212,.95)" strokeWidth="1.2" />
        <polyline points={orangePoints} fill="none" stroke="rgba(249,115,22,.90)" strokeWidth="1.2" />
        {goalEvents.map((event) => {
          const x = Math.min(98, Math.max(2, (event.timestampSecond / Math.max(match.durationSeconds, 1)) * 100));
          return <circle key={event.id} cx={x} cy={event.team === 'blue' ? 36 : 64} r="1.7" fill={event.team === 'blue' ? '#00e5d4' : '#f97316'} />;
        })}
      </svg>
      <div className="exact-score-events">
        {goalEvents.length === 0 ? <p>Sin goles registrados por el parser.</p> : goalEvents.map((event) => (
          <div key={event.id} className={`exact-score-event ${teamClass(event.team)}`}><span>{formatSecondsAsMinutes(event.timestampSecond)}</span><b>{eventLabel(event.type)}</b><em>{event.description}</em></div>
        ))}
      </div>
    </div>
  );
}


function AreaMetrics({ metrics, skillAreas }: { metrics: Partial<Record<SkillAreaId, number>>; skillAreas: SkillArea[] }) {
  return (
    <article className="analyzer-card game-area-card exact-pillar-card">
      <div className="analysis-panel-title"><div><p className="section-kicker">Pillar stats</p><h3>Áreas competitivas</h3></div></div>
      <div className="game-area-list exact-area-bars">
        {skillOrder.map((areaId) => {
          const areaName = skillAreas.find((area) => area.id === areaId)?.name ?? areaId;
          const value = metrics[areaId] ?? 0;
          return <div key={areaId} className="game-area-row"><div><strong>{areaName}</strong><span>{formatPercent(value)}</span></div><div><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div></div>;
        })}
      </div>
    </article>
  );
}

function PlayersTable({ players }: { players: MatchPlayerStat[] }) {
  return (
    <article className="analyzer-card players-pro-card exact-players-table-card">
      <div className="analysis-panel-title"><div><p className="section-kicker">Players</p><h3>Scoreboard</h3></div><span className="analyzer-pill cyan">{players.length}</span></div>
      <div className="players-table-wrap">
        {players.length === 0 ? <p className="empty-copy">Sin jugadores detectados con confianza.</p> : (
          <table className="players-pro-table exact-player-table"><thead><tr><th>Player</th><th>Team</th><th>Score</th><th>Goals</th><th>Assists</th><th>Saves</th><th>Shots</th><th>Demos</th></tr></thead><tbody>{players.map((player) => <tr key={player.id}><td>{player.playerName}</td><td><span className={`team-chip ${teamClass(player.team)}`}>{teamLabel(player.team)}</span></td><td>{player.score}</td><td>{player.goals}</td><td>{player.assists}</td><td>{player.saves}</td><td>{player.shots}</td><td>{player.demos}</td></tr>)}</tbody></table>
        )}
      </div>
    </article>
  );
}

function KeyEvents({ events }: { events: MatchEvent[] }) {
  return (
    <article className="analyzer-card key-events-card exact-events-card">
      <div className="analysis-panel-title"><div><p className="section-kicker">Events</p><h3>Eventos clave</h3></div><span className="analyzer-pill green">{events.length}</span></div>
      <div className="key-events-list">
        {events.length === 0 ? <p className="empty-copy">Sin eventos del match.</p> : events.map((event) => <div key={event.id} className={`key-event ${teamClass(event.team)}`}><span>{eventLabel(event.type)}</span><strong>{formatSecondsAsMinutes(event.timestampSecond)}</strong><p>{event.description}</p></div>)}
      </div>
    </article>
  );
}

function AnalysisCard({ title, value, body, tone }: { title: string; value: string; body: string; tone: 'orange' | 'cyan' | 'emerald' }) {
  return <article className={`analyzer-card match-learning-card ${tone}`}><p className="section-kicker">{title}</p><h3>{value}</h3><p>{body}</p></article>;
}

function ExactHorizontalBars({ players }: { players: MatchPlayerStat[] }) {
  const max = Math.max(...players.map((p) => p.score), 1);
  return <div className="exact-horizontal-bars">{players.map((p) => <div key={p.id}><span>{p.playerName}</span><i><b style={{ width: `${Math.max(8, (p.score / max) * 100)}%` }} /></i><em>{p.score}</em></div>)}</div>;
}

function FieldHeatMap({ side }: { side: 'blue' | 'orange' }) {
  const values = side === 'blue'
    ? [10.1, 7.5, 5.4, 16.2, 12.0, 8.6, 4.8, 6.7, 3.9]
    : [5.8, 8.0, 9.0, 8.3, 11.5, 12.9, 3.6, 5.1, 7.4];
  return (
    <div className={`rla-team-heatmap ${side}`}>
      <div className="rla-team-heatmap__goal" />
      {values.map((value, i) => (
        <span key={i} style={{ opacity: 0.25 + value / 18 }}>
          <b>{value.toFixed(1)}%</b>
        </span>
      ))}
      <i className="pad p1" /><i className="pad p2" /><i className="pad p3" /><i className="pad p4" />
    </div>
  );
}

function MiniTrend({ value }: { value: number }) {
  const points = [35, 45, 42, 60, 52, 66, 40, value || 54].map((v, i, arr) => `${(i / (arr.length - 1)) * 100},${80 - v * 0.55}`).join(' ');
  return <svg className="exact-mini-trend" viewBox="0 0 100 50" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="rgba(0,229,212,.95)" strokeWidth="1.3" /><line x1="0" x2="100" y1="25" y2="25" stroke="rgba(255,255,255,.14)" strokeDasharray="2 2" /></svg>;
}
