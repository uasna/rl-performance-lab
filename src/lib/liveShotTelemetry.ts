import type { PackCandidate } from './customTrainingPackFactory';

export type LiveShotTelemetry = {
  id: string;
  capturedAt: string;
  matchGuid: string;
  event: 'BallHit' | 'GoalScored' | 'CrossbarHit' | 'StatfeedEvent' | 'ShotCandidate' | 'TrainingTouch';
  playerName: string;
  playerTeamNum: number;
  arena: string;
  timeSeconds: number;
  elapsed: number;
  ballLocation?: { x: number; y: number; z: number };
  impactLocation?: { x: number; y: number; z: number };
  preHitSpeed?: number;
  postHitSpeed?: number;
  goalSpeed?: number;
  playerSpeed?: number;
  playerBoost?: number;
  ratingScore: number;
  reason: string;
  rawEvent?: string;
};

type AnyRecord = Record<string, unknown>;

const STORAGE_KEY = 'rl-performance-lab.live-shot-telemetry.v1';
const MAX_SHOTS = 250;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vector(value: unknown) {
  if (!isRecord(value)) return undefined;
  const x = numberValue(value.X ?? value.x, Number.NaN);
  const y = numberValue(value.Y ?? value.y, Number.NaN);
  const z = numberValue(value.Z ?? value.z, Number.NaN);
  if (![x, y, z].every(Number.isFinite)) return undefined;
  return { x, y, z };
}

function pickPlayer(data: AnyRecord) {
  const players = Array.isArray(data.Players) ? data.Players.filter(isRecord) : [];
  const scorer = isRecord(data.Scorer) ? data.Scorer : undefined;
  const lastTouch = isRecord(data.BallLastTouch) ? data.BallLastTouch : undefined;
  const lastTouchPlayer = isRecord(lastTouch?.Player) ? lastTouch.Player : undefined;
  const first = scorer ?? lastTouchPlayer ?? players[0];
  return {
    name: String(first?.Name ?? 'Cuenta RL'),
    team: numberValue(first?.TeamNum, 0),
    speed: numberValue(first?.Speed, 0),
  };
}

function shotRating(input: { postHitSpeed?: number; goalSpeed?: number; preHitSpeed?: number; location?: { x: number; y: number; z: number }; event: string }) {
  const speed = input.goalSpeed || input.postHitSpeed || 0;
  const speedScore = Math.max(0, Math.min(100, (speed / 1200) * 100));
  const placementScore = input.location ? Math.max(0, Math.min(100, 100 - Math.abs(input.location.x) / 45 - Math.max(0, input.location.z - 320) / 30)) : 45;
  const eventBonus = input.event === 'GoalScored' ? 25 : input.event === 'CrossbarHit' ? 10 : 0;
  return Math.round(Math.max(1, Math.min(100, speedScore * 0.48 + placementScore * 0.42 + eventBonus)));
}

export function loadLiveShotTelemetry(): LiveShotTelemetry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) as LiveShotTelemetry[] : [];
  } catch {
    return [];
  }
}

export function saveLiveShotTelemetry(shots: LiveShotTelemetry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shots.slice(-MAX_SHOTS)));
  } catch {
    // localStorage puede fallar en modo privado o por cuota.
  }
}

export function clearLiveShotTelemetry() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function appendLiveShotTelemetry(shot: LiveShotTelemetry) {
  const current = loadLiveShotTelemetry();
  const exists = current.some((item) => item.id === shot.id);
  const next = exists ? current : [...current, shot].slice(-MAX_SHOTS);
  saveLiveShotTelemetry(next);
  return next;
}

export function extractLiveShotTelemetry(event: string, data: unknown, game: unknown): LiveShotTelemetry | null {
  if (!isRecord(data)) return null;
  const gameData = isRecord(game) ? game : {};
  const supported = ['BallHit', 'GoalScored', 'CrossbarHit', 'StatfeedEvent'];
  if (!supported.includes(event)) return null;

  const statType = String(data.Type ?? data.EventName ?? '');
  if (event === 'StatfeedEvent' && !/shot|goal|assist|save/i.test(statType)) return null;

  const ball = isRecord(data.Ball) ? data.Ball : {};
  const player = pickPlayer(data);
  const impactLocation = vector(data.ImpactLocation) ?? vector(data.BallLocation) ?? vector(ball.Location);
  const ballLocation = vector(data.BallLocation) ?? vector(ball.Location) ?? impactLocation;
  const postHitSpeed = numberValue(ball.PostHitSpeed, numberValue(data.BallSpeed, 0));
  const preHitSpeed = numberValue(ball.PreHitSpeed, 0);
  const goalSpeed = numberValue(data.GoalSpeed, 0);
  const ratingScore = shotRating({ event, postHitSpeed, preHitSpeed, goalSpeed, location: impactLocation ?? ballLocation });
  const matchGuid = String(data.MatchGuid ?? gameData.MatchGuid ?? 'live-match');
  const timeSeconds = numberValue(gameData.TimeSeconds ?? data.GoalTime, 0);
  const elapsed = numberValue(gameData.Elapsed ?? data.GoalTime, 0);
  const capturedAt = new Date().toISOString();
  const locationKey = impactLocation ? `${Math.round(impactLocation.x)}-${Math.round(impactLocation.y)}-${Math.round(impactLocation.z)}` : 'no-location';

  return {
    id: `${matchGuid}-${event}-${player.name}-${Math.round(timeSeconds)}-${locationKey}-${Math.round(goalSpeed || postHitSpeed)}`.replace(/[^a-z0-9-_]/gi, '-'),
    capturedAt,
    matchGuid,
    event: event as LiveShotTelemetry['event'],
    playerName: player.name,
    playerTeamNum: player.team,
    arena: String(gameData.Arena ?? ''),
    timeSeconds,
    elapsed,
    ballLocation,
    impactLocation,
    preHitSpeed,
    postHitSpeed,
    goalSpeed,
    playerSpeed: player.speed,
    playerBoost: 0,
    ratingScore,
    reason: event === 'GoalScored'
      ? `Gol detectado con velocidad ${Math.round(goalSpeed || postHitSpeed)} uu/s.`
      : event === 'CrossbarHit'
        ? 'Tiro al travesaño detectado: candidato fuerte para recrear.'
        : ratingScore < 62
          ? 'Tiro con rating bajo: velocidad/colocación mejorable.'
          : 'Tiro detectado por Stats API local.',
    rawEvent: event,
  };
}

export function liveTelemetryToPackCandidates(shots: LiveShotTelemetry[]): PackCandidate[] {
  return shots
    .filter((shot) => shot.event !== 'StatfeedEvent')
    .sort((a, b) => a.ratingScore - b.ratingScore)
    .slice(0, 15)
    .map((shot, index) => ({
      id: `live-${shot.id}-${index}`,
      replayId: shot.matchGuid || 'live-stats-api',
      replayFileName: 'Stats API live capture',
      matchId: shot.matchGuid || 'live-match',
      matchLabel: `${shot.arena || 'Arena'} · live telemetry`,
      mapName: shot.arena || 'Arena no detectada',
      playedAt: shot.capturedAt,
      playerName: shot.playerName,
      shotType: shot.event === 'GoalScored' ? 'low_power_finish' : shot.event === 'CrossbarHit' ? 'missed_shot' : shot.event === 'TrainingTouch' ? 'poor_rating_shot' : shot.ratingScore < 62 ? 'poor_rating_shot' : 'low_placement_finish',
      shotScore: shot.ratingScore,
      reason: `${shot.reason}${shot.impactLocation ? ` Impacto (${Math.round(shot.impactLocation.x)}, ${Math.round(shot.impactLocation.y)}, ${Math.round(shot.impactLocation.z)}).` : ''}`,
      goals: shot.event === 'GoalScored' ? 1 : 0,
      shots: 1,
      estimatedTimestampSecond: Math.max(0, Math.round(shot.elapsed || shot.timeSeconds || 0)),
      shotTelemetry: {
        event: shot.event,
        playerTeamNum: shot.playerTeamNum,
        ballLocation: shot.ballLocation,
        impactLocation: shot.impactLocation,
        preHitSpeed: shot.preHitSpeed,
        postHitSpeed: shot.postHitSpeed,
        goalSpeed: shot.goalSpeed,
        playerSpeed: shot.playerSpeed,
        playerBoost: shot.playerBoost,
      },
    }));
}

export function exportLiveTelemetryJson() {
  const blob = new Blob([JSON.stringify(loadLiveShotTelemetry(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `rl-performance-live-shot-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
