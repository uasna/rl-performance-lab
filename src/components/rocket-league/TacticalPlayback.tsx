import { useEffect, useState, type MouseEvent } from 'react';
import { formatSecondsAsMinutes } from '../../lib/formatters';
import type { MatchEvent, MatchPlayerStat, RocketLeagueMatch, SkillAreaId } from '../../types/rocketLeague';

type FieldPoint = { x: number; y: number };
type ViewMode = 'isometric' | 'topdown';
type FieldFilter = 'me' | 'team' | 'all';

type TacticalRoute = {
  team: 'blue' | 'orange';
  points: FieldPoint[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function interpolatePoint(a: FieldPoint, b: FieldPoint, t: number): FieldPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function routePoint(route: FieldPoint[], playhead: number) {
  if (!route.length) return { x: 52, y: 50 };
  if (route.length === 1) return route[0];
  const scaled = clamp01(playhead) * (route.length - 1);
  const index = Math.min(route.length - 2, Math.floor(scaled));
  return interpolatePoint(route[index], route[index + 1], scaled - index);
}

const DEFAULT_ROUTES: TacticalRoute[] = [
  { team: 'blue', points: [{ x: 35, y: 36 }, { x: 42, y: 31 }, { x: 51, y: 31 }, { x: 61, y: 37 }] },
  { team: 'blue', points: [{ x: 50, y: 31 }, { x: 57, y: 38 }, { x: 64, y: 45 }, { x: 72, y: 52 }] },
  { team: 'orange', points: [{ x: 66, y: 43 }, { x: 61, y: 50 }, { x: 57, y: 58 }, { x: 54, y: 66 }] },
  { team: 'orange', points: [{ x: 58, y: 62 }, { x: 50, y: 66 }, { x: 41, y: 72 }, { x: 31, y: 82 }] },
];

const ROUTES_BY_AREA: Partial<Record<SkillAreaId, TacticalRoute[]>> = {
  positioning: [
    { team: 'blue', points: [{ x: 54, y: 34 }, { x: 63, y: 45 }, { x: 70, y: 54 }, { x: 77, y: 66 }] },
    { team: 'blue', points: [{ x: 70, y: 56 }, { x: 65, y: 50 }, { x: 58, y: 41 }, { x: 51, y: 36 }] },
    { team: 'blue', points: [{ x: 76, y: 67 }, { x: 70, y: 63 }, { x: 66, y: 57 }, { x: 61, y: 51 }] },
    { team: 'orange', points: [{ x: 37, y: 84 }, { x: 43, y: 74 }, { x: 49, y: 67 }, { x: 57, y: 58 }] },
    { team: 'orange', points: [{ x: 48, y: 73 }, { x: 52, y: 68 }, { x: 58, y: 64 }, { x: 64, y: 60 }] },
  ],
  rotation: [
    { team: 'orange', points: [{ x: 35, y: 72 }, { x: 44, y: 63 }, { x: 54, y: 55 }, { x: 64, y: 49 }] },
    { team: 'orange', points: [{ x: 48, y: 69 }, { x: 42, y: 63 }, { x: 39, y: 57 }, { x: 45, y: 53 }] },
    { team: 'blue', points: [{ x: 72, y: 39 }, { x: 66, y: 42 }, { x: 61, y: 47 }, { x: 56, y: 52 }] },
    { team: 'blue', points: [{ x: 61, y: 49 }, { x: 66, y: 45 }, { x: 73, y: 39 }, { x: 82, y: 33 }] },
  ],
  defence: [
    { team: 'blue', points: [{ x: 54, y: 36 }, { x: 60, y: 40 }, { x: 66, y: 43 }, { x: 71, y: 48 }] },
    { team: 'blue', points: [{ x: 64, y: 43 }, { x: 58, y: 47 }, { x: 53, y: 51 }, { x: 47, y: 56 }] },
    { team: 'orange', points: [{ x: 74, y: 57 }, { x: 67, y: 55 }, { x: 59, y: 52 }, { x: 53, y: 50 }] },
    { team: 'orange', points: [{ x: 49, y: 78 }, { x: 43, y: 70 }, { x: 38, y: 64 }, { x: 33, y: 58 }] },
  ],
  boost: [
    { team: 'blue', points: [{ x: 33, y: 36 }, { x: 42, y: 31 }, { x: 50, y: 31 }, { x: 59, y: 37 }] },
    { team: 'blue', points: [{ x: 50, y: 31 }, { x: 56, y: 39 }, { x: 60, y: 47 }, { x: 58, y: 54 }] },
    { team: 'orange', points: [{ x: 58, y: 62 }, { x: 50, y: 66 }, { x: 40, y: 72 }, { x: 31, y: 82 }] },
    { team: 'orange', points: [{ x: 66, y: 43 }, { x: 63, y: 52 }, { x: 58, y: 60 }, { x: 54, y: 68 }] },
  ],
};

const BALL_ROUTES: Partial<Record<SkillAreaId, FieldPoint[]>> = {
  positioning: [{ x: 52, y: 50 }, { x: 61, y: 48 }, { x: 72, y: 54 }, { x: 80, y: 65 }],
  defence: [{ x: 76, y: 56 }, { x: 65, y: 52 }, { x: 56, y: 49 }, { x: 47, y: 56 }],
  boost: [{ x: 52, y: 50 }, { x: 57, y: 48 }, { x: 63, y: 51 }, { x: 69, y: 58 }],
  rotation: [{ x: 52, y: 50 }, { x: 48, y: 54 }, { x: 43, y: 58 }, { x: 37, y: 63 }],
};

const DEFAULT_BALL_ROUTE: FieldPoint[] = [{ x: 52, y: 50 }, { x: 58, y: 48 }, { x: 64, y: 45 }, { x: 71, y: 39 }];

function seekFromEvent(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return clamp01((event.clientX - rect.left) / Math.max(rect.width, 1));
}

export function ConceptTacticalPitch({
  area,
  initialView = 'topdown',
  playable = true,
  variant = 'concept',
}: {
  area: SkillAreaId;
  initialView?: ViewMode;
  playable?: boolean;
  variant?: 'concept' | 'replay';
}) {
  const [isPlaying, setIsPlaying] = useState(variant === 'replay');
  const [playhead, setPlayhead] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const routes = ROUTES_BY_AREA[area] ?? DEFAULT_ROUTES;
  const liveBall = routePoint(BALL_ROUTES[area] ?? DEFAULT_BALL_ROUTE, playhead);
  const liveSecond = Math.round(273 * playhead);

  useEffect(() => {
    if (!playable || !isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setPlayhead((current) => {
        const next = current + 0.012;
        return next >= 1 ? 0 : next;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [isPlaying, playable]);

  return (
    <div className={`exact-tactical-pitch rla-tactical-model${viewMode === 'isometric' ? ' isometric' : ''}${variant === 'replay' ? ' is-replay' : ''}`}>
      <div className="rla-field-badge rla-live-badge">
        <button type="button" className={viewMode === 'isometric' ? 'is-active' : ''} onClick={() => setViewMode('isometric')}>ISOMETRIC</button>
        <button type="button" className={viewMode === 'topdown' ? 'is-active' : ''} onClick={() => setViewMode('topdown')}>TOP-DOWN</button>
      </div>
      {variant === 'replay' ? <div className="rla-live-score"><b>0</b><span>{formatSecondsAsMinutes(liveSecond)}</span><em>0</em></div> : null}
      <svg viewBox="0 0 120 92" preserveAspectRatio="xMidYMid meet" className="rla-live-tactical-svg">
        <defs>
          <linearGradient id={`blue-zone-${area}`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="rgba(65,124,168,.58)"/><stop offset="1" stopColor="rgba(16,44,74,.72)"/></linearGradient>
          <linearGradient id={`orange-zone-${area}`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="rgba(105,58,36,.66)"/><stop offset="1" stopColor="rgba(39,25,25,.78)"/></linearGradient>
          <filter id={`rla-route-glow-${area}`}><feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="rgba(0,229,212,.5)"/></filter>
        </defs>
        <polygon points="18,20 72,7 104,25 79,75 24,84 5,60" fill="rgba(12,25,41,.94)" stroke="rgba(141,248,255,.26)" strokeWidth=".7" />
        <polygon points="18,20 72,7 104,25 58,48 5,60" fill={`url(#blue-zone-${area})`} />
        <polygon points="5,60 58,48 104,25 79,75 24,84" fill={`url(#orange-zone-${area})`} />
        <polygon points="18,20 72,7 72,22 20,35" fill="rgba(112,178,230,.13)" />
        <polygon points="72,7 104,25 104,38 72,22" fill="rgba(112,178,230,.10)" />
        <line x1="5" x2="104" y1="60" y2="25" stroke="rgba(255,255,255,.15)" strokeDasharray="2 2" />
        <polyline points="32,31 44,24 64,28 76,34" fill="none" stroke="rgba(141,248,255,.42)" />
        <polyline points="28,70 42,76 63,72 74,64" fill="none" stroke="rgba(255,155,69,.45)" />
        <rect x="86" y="27" width="13" height="13" fill="rgba(75,160,218,.12)" stroke="rgba(145,224,255,.55)" transform="skewY(-22)" />
        <rect x="17" y="68" width="14" height="13" fill="rgba(255,151,64,.14)" stroke="rgba(255,174,99,.58)" transform="skewY(-22)" />
        {viewMode === 'topdown' ? <g opacity=".34" transform="translate(3 2) scale(.94)"><rect x="8" y="8" width="100" height="76" rx="4" fill="none" stroke="rgba(255,255,255,.18)"/><line x1="8" x2="108" y1="46" y2="46" stroke="rgba(255,255,255,.14)" strokeDasharray="2 2"/><circle cx="58" cy="46" r="10" fill="none" stroke="rgba(255,255,255,.12)"/></g> : null}
        {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={17 + ((i * 11) % 76)} cy={24 + ((i * 19) % 48)} r=".55" fill="rgba(255,255,255,.10)" />)}
        {routes.map((route, index) => {
          const routeString = route.points.map((point) => `${point.x},${point.y}`).join(' ');
          const point = routePoint(route.points, (playhead + index * 0.08) % 1);
          const previous = routePoint(route.points, Math.max(0, ((playhead + index * 0.08) % 1) - 0.1));
          const color = route.team === 'blue' ? '#8df8ff' : '#ff9b45';
          return (
            <g key={`${route.team}-${index}`} className="rla-live-car">
              <polyline points={routeString} fill="none" stroke={color} strokeWidth=".85" strokeDasharray="2.4 2.6" opacity=".40" />
              <path d={`M${previous.x} ${previous.y} C ${previous.x + 3} ${previous.y - 4}, ${point.x - 4} ${point.y + 5}, ${point.x} ${point.y}`} fill="none" stroke={color} strokeWidth=".75" strokeDasharray="1.6 1.8" opacity=".55" />
              <rect x={point.x - 2.5} y={point.y - 1.8} width="5" height="3.6" rx=".8" fill={color} transform={`rotate(${route.team === 'blue' ? -18 : -26} ${point.x} ${point.y})`} stroke="rgba(0,0,0,.65)" strokeWidth=".45" opacity={area === 'rotation' || area === 'positioning' ? .88 : .78} filter={`url(#rla-route-glow-${area})`} />
              <circle cx={point.x + 4.5} cy={point.y - 5.2} r="1" fill="rgba(255,255,255,.58)" />
            </g>
          );
        })}
        <path d={`M52 50 C ${liveBall.x - 12} ${liveBall.y - 10}, ${liveBall.x - 6} ${liveBall.y + 8}, ${liveBall.x} ${liveBall.y}`} fill="none" stroke="rgba(255,255,255,.34)" strokeDasharray="1.8 2.2" strokeWidth=".7" />
        <circle cx={liveBall.x} cy={liveBall.y} r="2.8" fill="#f7f8ff" stroke="rgba(0,0,0,.55)" />
      </svg>
      {playable ? <PlaybackControls isPlaying={isPlaying} playhead={playhead} onToggle={() => setIsPlaying((value) => !value)} onSeek={setPlayhead} /> : null}
    </div>
  );
}

function calculateBallPoint(playhead: number, events: MatchEvent[], durationSeconds: number): FieldPoint {
  const normalizedEvents = events.filter((event) => event.timestampSecond >= 0).sort((a, b) => a.timestampSecond - b.timestampSecond).slice(0, 10);
  const anchorPoints = [
    { time: 0, point: { x: 52, y: 50 } },
    ...normalizedEvents.map((event, index) => ({
      time: Math.min(1, event.timestampSecond / Math.max(durationSeconds, 1)),
      point: event.team === 'blue' ? { x: 82 - (index % 3) * 6, y: 33 + (index % 4) * 5 } : { x: 28 + (index % 3) * 7, y: 62 - (index % 4) * 4 },
    })),
    { time: 1, point: { x: 58, y: 48 } },
  ].sort((a, b) => a.time - b.time);
  const nextIndex = anchorPoints.findIndex((item) => item.time >= playhead);
  if (nextIndex <= 0) return anchorPoints[0].point;
  const previous = anchorPoints[nextIndex - 1];
  const next = anchorPoints[nextIndex];
  return interpolatePoint(previous.point, next.point, clamp01((playhead - previous.time) / Math.max(next.time - previous.time, 0.0001)));
}

export function ReplayFieldView({ match, events, playhead, isPlaying, filter, onTogglePlayback, onSeek, onFilterChange }: {
  match: RocketLeagueMatch;
  events: MatchEvent[];
  playhead: number;
  isPlaying: boolean;
  filter: FieldFilter;
  onTogglePlayback: () => void;
  onSeek: (next: number) => void;
  onFilterChange: (filter: FieldFilter) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('isometric');
  const bluePlayers = (match.players ?? []).filter((player) => player.team === 'blue');
  const orangePlayers = (match.players ?? []).filter((player) => player.team === 'orange');
  const viewEvents = events.slice(0, 10);
  const ball = calculateBallPoint(playhead, viewEvents, match.durationSeconds || 300);
  const liveSecond = Math.round((match.durationSeconds || 300) * playhead);

  return (
    <div className="exact-replay-field rla-iso-stage">
      <div className="rla-field-toolbar">
        <button type="button" className={`rla-toggle ${viewMode === 'isometric' ? 'is-active' : ''}`} onClick={() => setViewMode('isometric')}>ISOMETRIC</button>
        <button type="button" className={`rla-toggle ${viewMode === 'topdown' ? 'is-active' : ''}`} onClick={() => setViewMode('topdown')}>TOP-DOWN</button>
      </div>
      <div className="exact-field-score rla-iso-score"><b>{match.score.blue}</b><span>{formatSecondsAsMinutes(liveSecond)}</span><em>{match.score.orange}</em></div>
      {viewMode === 'topdown' ? <TopDownField match={match} events={viewEvents} playhead={playhead} filter={filter} bluePlayers={bluePlayers} orangePlayers={orangePlayers} /> : null}
      <IsoReplayField match={match} events={viewEvents} playhead={playhead} filter={filter} bluePlayers={bluePlayers} orangePlayers={orangePlayers} ball={ball} visible={viewMode === 'isometric'} />
      <PlaybackControls isPlaying={isPlaying} playhead={playhead} onToggle={onTogglePlayback} onSeek={onSeek} className="rla-iso-controls" filters={{ active: filter, onChange: onFilterChange }} />
    </div>
  );
}

function IsoReplayField({ match, events, playhead, filter, bluePlayers, orangePlayers, ball, visible }: { match: RocketLeagueMatch; events: MatchEvent[]; playhead: number; filter: FieldFilter; bluePlayers: MatchPlayerStat[]; orangePlayers: MatchPlayerStat[]; ball: FieldPoint; visible: boolean }) {
  return (
    <svg className="rla-iso-field-svg" style={{ display: visible ? 'block' : 'none' }} viewBox="0 0 120 92" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Isometric replay field">
      <defs>
        <linearGradient id="rlaBlueHalf" x1="0" x2="1" y1="0" y2="1"><stop stopColor="rgba(58,117,165,.62)"/><stop offset="1" stopColor="rgba(18,48,78,.72)"/></linearGradient>
        <linearGradient id="rlaOrangeHalf" x1="0" x2="1" y1="0" y2="1"><stop stopColor="rgba(105,58,36,.70)"/><stop offset="1" stopColor="rgba(42,26,26,.76)"/></linearGradient>
        <filter id="rlaFieldGlow"><feDropShadow dx="0" dy="12" stdDeviation="7" floodColor="rgba(0,0,0,.55)"/></filter>
      </defs>
      <g filter="url(#rlaFieldGlow)">
        <polygon points="18,20 72,7 104,25 79,75 24,84 5,60" fill="rgba(15,31,48,.92)" stroke="rgba(128,211,255,.22)" strokeWidth=".7" />
        <polygon points="18,20 72,7 104,25 58,48 5,60" fill="url(#rlaBlueHalf)" stroke="rgba(115,200,255,.18)" />
        <polygon points="5,60 58,48 104,25 79,75 24,84" fill="url(#rlaOrangeHalf)" stroke="rgba(255,155,75,.18)" />
        <polygon points="18,20 72,7 72,22 20,35" fill="rgba(65,115,158,.20)" />
        <polygon points="72,7 104,25 104,39 72,22" fill="rgba(91,137,174,.16)" />
        <line x1="58" y1="48" x2="58" y2="17" stroke="rgba(165,205,240,.17)" />
        <line x1="58" y1="48" x2="58" y2="79" stroke="rgba(255,161,82,.14)" />
        <line x1="5" y1="60" x2="104" y2="25" stroke="rgba(255,255,255,.12)" strokeDasharray="2 2" />
        <polyline points="32,31 44,24 64,28 76,34" fill="none" stroke="rgba(138,226,255,.48)" strokeWidth=".75" />
        <polyline points="28,70 42,76 63,72 74,64" fill="none" stroke="rgba(255,156,72,.50)" strokeWidth=".75" />
        <rect x="86" y="27" width="13" height="13" fill="rgba(75,160,218,.12)" stroke="rgba(145,224,255,.55)" transform="skewY(-22)" />
        <rect x="17" y="68" width="14" height="13" fill="rgba(255,151,64,.14)" stroke="rgba(255,174,99,.58)" transform="skewY(-22)" />
        {Array.from({ length: 18 }, (_, i) => <circle key={`dot-${i}`} cx={18 + ((i * 13) % 76)} cy={25 + ((i * 17) % 48)} r=".55" fill="rgba(255,255,255,.11)" />)}
        <path d="M28 65 C38 54 47 51 58 48" fill="none" stroke="rgba(255,156,72,.52)" strokeDasharray="2 2" />
        <path d="M64 44 C73 37 81 34 91 31" fill="none" stroke="rgba(108,215,255,.42)" strokeDasharray="2 2" />
        {bluePlayers.map((player, index) => <FieldPlayer key={player.id} team="blue" index={index} name={player.playerName} playhead={playhead} dimmed={filter === 'me' && index > 0} />)}
        {orangePlayers.map((player, index) => <FieldPlayer key={player.id} team="orange" index={index} name={player.playerName} playhead={playhead} dimmed={filter !== 'all'} />)}
        {events.map((event, index) => <circle key={event.id} cx={21 + ((index * 19) % 71)} cy={24 + (event.timestampSecond % 42)} r="1.25" fill={event.team === 'orange' ? '#ff9b45' : '#8df8ff'} opacity=".88" />)}
        <path d={`M52 50 C ${ball.x - 12} ${ball.y - 10}, ${ball.x - 6} ${ball.y + 8}, ${ball.x} ${ball.y}`} fill="none" stroke="rgba(255,255,255,.32)" strokeDasharray="1.7 2" strokeWidth=".65" />
        <circle cx={ball.x} cy={ball.y} r="2.85" fill="#f7f8ff" stroke="rgba(0,0,0,.6)" />
      </g>
    </svg>
  );
}

function TopDownField({ match, events, playhead, filter, bluePlayers, orangePlayers }: { match: RocketLeagueMatch; events: MatchEvent[]; playhead: number; filter: FieldFilter; bluePlayers: MatchPlayerStat[]; orangePlayers: MatchPlayerStat[] }) {
  const ball = calculateBallPoint(playhead, events, Math.max(match.durationSeconds || 300, 1));
  const ballPoint = { x: 12 + ball.x * 0.76, y: 8 + ball.y * 0.82 };
  return (
    <svg className="rla-topdown-field-svg" viewBox="0 0 100 84" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Top-down replay field">
      <defs>
        <linearGradient id="rlaTopBlue" x1="0" x2="0" y1="0" y2="1"><stop stopColor="rgba(55,125,190,.60)"/><stop offset="1" stopColor="rgba(20,52,86,.62)"/></linearGradient>
        <linearGradient id="rlaTopOrange" x1="0" x2="0" y1="0" y2="1"><stop stopColor="rgba(105,58,36,.66)"/><stop offset="1" stopColor="rgba(58,32,24,.70)"/></linearGradient>
      </defs>
      <rect x="9" y="6" width="82" height="72" rx="4" fill="rgba(8,18,30,.95)" stroke="rgba(132,217,255,.25)" />
      <rect x="12" y="9" width="76" height="34" fill="url(#rlaTopBlue)" />
      <rect x="12" y="43" width="76" height="32" fill="url(#rlaTopOrange)" />
      <line x1="12" y1="43" x2="88" y2="43" stroke="rgba(255,255,255,.18)" strokeDasharray="2 2" />
      <circle cx="50" cy="43" r="7" fill="none" stroke="rgba(255,255,255,.12)" />
      <rect x="39" y="8" width="22" height="4" fill="rgba(122,210,255,.22)" stroke="rgba(160,232,255,.48)" />
      <rect x="39" y="72" width="22" height="4" fill="rgba(255,160,76,.20)" stroke="rgba(255,180,98,.48)" />
      {bluePlayers.map((player, index) => <TopDownPlayer key={player.id} team="blue" index={index} name={player.playerName} playhead={playhead} dimmed={filter === 'me' && index > 0} />)}
      {orangePlayers.map((player, index) => <TopDownPlayer key={player.id} team="orange" index={index} name={player.playerName} playhead={playhead} dimmed={filter !== 'all'} />)}
      {events.slice(0, 8).map((event, index) => <circle key={event.id} cx={18 + ((index * 11) % 64)} cy={event.team === 'orange' ? 52 + (index % 15) : 22 + (index % 14)} r="1.2" fill={event.team === 'orange' ? '#ff9b45' : '#8df8ff'} opacity=".86" />)}
      <circle cx={ballPoint.x} cy={ballPoint.y} r="2.5" fill="#f9fbff" stroke="rgba(0,0,0,.65)" />
    </svg>
  );
}

function FieldPlayer({ team, index, name, playhead, dimmed }: { team: 'blue' | 'orange'; index: number; name: string; playhead: number; dimmed?: boolean }) {
  const positions = team === 'blue' ? [{ x: 47, y: 36 }, { x: 72, y: 34 }, { x: 61, y: 44 }] : [{ x: 35, y: 64 }, { x: 56, y: 67 }, { x: 43, y: 75 }];
  const base = positions[index % positions.length];
  const drift = Math.sin(playhead * Math.PI * 2 + index) * 7;
  const p = { x: base.x + drift * (team === 'blue' ? 0.85 : -0.55), y: base.y + Math.cos(playhead * Math.PI * 2 + index * 0.7) * 4 };
  const color = team === 'blue' ? '#8df8ff' : '#ff9b45';
  return (
    <g className={`rla-field-player ${team}${dimmed ? ' is-dimmed' : ''}`}>
      <path d={`M${p.x - 8} ${p.y + 8} C ${p.x - 4} ${p.y + 2}, ${p.x + 3} ${p.y + 5}, ${p.x + 5} ${p.y - 5}`} fill="none" stroke={color} strokeWidth=".7" strokeDasharray="1.8 1.8" opacity=".52" />
      <rect x={p.x - 2.5} y={p.y - 1.8} width="5" height="3.6" rx=".8" fill={color} transform={`rotate(-20 ${p.x} ${p.y})`} stroke="rgba(0,0,0,.65)" strokeWidth=".45" />
      <circle cx={p.x + 4.8} cy={p.y - 5.6} r="1.15" fill="rgba(255,255,255,.58)" />
      <text x={p.x + 4} y={p.y - 3.6} fill="rgba(230,240,255,.88)" fontSize="3.1">{name.slice(0, 9)}</text>
    </g>
  );
}

function TopDownPlayer({ team, index, name, playhead, dimmed }: { team: 'blue' | 'orange'; index: number; name: string; playhead: number; dimmed?: boolean }) {
  const positions = team === 'blue' ? [{ x: 40, y: 28 }, { x: 60, y: 28 }, { x: 50, y: 36 }] : [{ x: 40, y: 56 }, { x: 60, y: 56 }, { x: 50, y: 64 }];
  const base = positions[index % positions.length];
  const x = base.x + Math.sin(playhead * Math.PI * 2 + index) * 5;
  const y = base.y + Math.cos(playhead * Math.PI * 2 + index) * 3;
  const color = team === 'blue' ? '#8df8ff' : '#ff9b45';
  return <g opacity={dimmed ? .25 : 1}><circle cx={x} cy={y} r="2" fill={color} stroke="rgba(0,0,0,.6)"/><text x={x + 3} y={y - 2} fontSize="3" fill="rgba(235,244,255,.9)">{name.slice(0, 8)}</text></g>;
}

function PlaybackControls({ isPlaying, playhead, onToggle, onSeek, filters, className = 'rla-concept-controls' }: { isPlaying: boolean; playhead: number; onToggle: () => void; onSeek: (next: number) => void; filters?: { active: FieldFilter; onChange: (filter: FieldFilter) => void }; className?: string }) {
  const filterButtons: FieldFilter[] = ['me', 'team', 'all'];
  const labels: Record<FieldFilter, string> = { me: 'By me', team: 'My team', all: 'All' };
  return (
    <div className={`exact-replay-controls ${className}`}>
      <button type="button" onClick={onToggle} aria-label={isPlaying ? 'Pause tactical playback' : 'Play tactical playback'}>{isPlaying ? 'Ⅱ' : '▷'}</button>
      <i onClick={(event) => onSeek(seekFromEvent(event))} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(playhead * 100)} tabIndex={0}><b style={{ width: `${Math.round(playhead * 100)}%` }} /></i>
      {filters ? filterButtons.map((filter) => <span key={filter} role="button" tabIndex={0} onClick={() => filters.onChange(filter)} className={filters.active === filter ? 'is-active' : ''}>{labels[filter]}</span>) : <span className="is-active">Animated</span>}
    </div>
  );
}
