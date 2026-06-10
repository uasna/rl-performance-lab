import type { CustomPackFactorySettings, RocketLeagueMatch, RocketLeagueSettings } from '../types/rocketLeague';

export type PackCandidate = {
  id: string;
  replayId: string;
  replayFileName: string;
  matchId: string;
  matchLabel: string;
  mapName: string;
  playedAt: string;
  playerName: string;
  shotType: 'missed_shot' | 'poor_rating_shot' | 'low_power_finish' | 'low_placement_finish';
  shotScore: number;
  reason: string;
  goals: number;
  shots: number;
  estimatedTimestampSecond: number;
  shotTelemetry?: {
    event?: string;
    playerTeamNum?: number;
    ballLocation?: { x: number; y: number; z: number };
    impactLocation?: { x: number; y: number; z: number };
    preHitSpeed?: number;
    postHitSpeed?: number;
    goalSpeed?: number;
    playerSpeed?: number;
    playerBoost?: number;
  };
};

export type PackFactoryStatus = {
  weekKey: string;
  processedGames: number;
  gamesUntilAutoPack: number;
  automaticAvailable: number;
  automaticGeneratedThisWeek: number;
  manualRemainingThisWeek: number;
  manualUsedThisWeek: number;
  maxManualPerWeek: number;
  maxAutomaticPerWeek: number;
  candidates: PackCandidate[];
  canGenerateManual: boolean;
  canGenerateAutomatic: boolean;
  message: string;
};

export type CustomPackDraft = {
  id: string;
  title: string;
  createdAt: string;
  requestType: 'manual' | 'automatic';
  status: 'draft' | 'staged' | 'installed' | 'blocked';
  shots: PackCandidate[];
  sourceReplayIds: string[];
  note: string;
};

function getWeekKey(date = new Date()) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 1));
  const diff = Number(date) - Number(start) + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000;
  const week = Math.ceil(((diff / 86_400_000) + start.getUTCDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getFactorySettings(settings: RocketLeagueSettings): CustomPackFactorySettings {
  const weekKey = getWeekKey();
  const current = settings.customPackFactory;
  if (!current || current.weekKey !== weekKey) {
    return {
      weekKey,
      manualRequestsUsed: 0,
      automaticPacksGenerated: 0,
      generatedPackIds: [],
      stagedPackFolder: '',
      lastGeneratedAt: '',
    };
  }
  return current;
}

function inferShotScore(match: RocketLeagueMatch): number {
  const shots = Math.max(0, match.playerStats.shots || 0);
  if (!shots) return 0;
  const conversion = (match.playerStats.goals / shots) * 100;
  const scoreSignal = Math.min(100, (match.playerStats.score || 0) / 7);
  const pressure = Math.min(100, (match.performance?.possessionPressure || 0));
  return Math.round((conversion * 0.52) + (scoreSignal * 0.28) + (pressure * 0.2));
}

export function buildPackCandidates(matches: RocketLeagueMatch[]): PackCandidate[] {
  return matches.flatMap((match) => {
    const shots = Math.max(0, match.playerStats.shots || 0);
    const goals = Math.max(0, match.playerStats.goals || 0);
    if (!shots) return [];

    const missed = Math.max(0, shots - goals);
    const shotScore = inferShotScore(match);
    const playerName = match.players?.find((player) => player.team === match.teamColor)?.playerName
      ?? match.players?.[0]?.playerName
      ?? 'Cuenta RL';
    const base = {
      replayId: match.replayId ?? match.id,
      replayFileName: match.replayFileName ?? 'manual-match',
      matchId: match.id,
      matchLabel: `${match.mapName} · ${match.mode}`,
      mapName: match.mapName,
      playedAt: match.playedAt,
      playerName,
      goals,
      shots,
    };

    const candidates: PackCandidate[] = [];
    for (let index = 0; index < Math.min(missed, 3); index += 1) {
      candidates.push({
        ...base,
        id: `${match.id}-miss-${index}`,
        shotType: 'missed_shot',
        shotScore: Math.max(1, Math.min(100, shotScore - 18 - index * 4)),
        reason: 'Tiro fallado detectado desde diferencia entre tiros y goles. Se prioriza para recreación futura.',
        estimatedTimestampSecond: Math.min(match.durationSeconds || 300, 25 + index * 42),
      });
    }

    if (shotScore > 0 && shotScore < 62) {
      candidates.push({
        ...base,
        id: `${match.id}-poor-rating`,
        shotType: 'poor_rating_shot',
        shotScore,
        reason: 'Tiro/partida con rating ofensivo bajo: colocación + velocidad probablemente no estuvieron al nivel esperado.',
        estimatedTimestampSecond: Math.min(match.durationSeconds || 300, Math.max(12, Math.round((match.durationSeconds || 300) * 0.55))),
      });
    }

    return candidates;
  }).sort((a, b) => a.shotScore - b.shotScore).slice(0, 15);
}

export function getPackFactoryStatus(matches: RocketLeagueMatch[], settings: RocketLeagueSettings): PackFactoryStatus {
  const factory = getFactorySettings(settings);
  const processedGames = matches.filter((match) => match.source === 'replay_parser' || match.replayId || match.replayJsonPath).length;
  const unlockedAutoPacks = Math.floor(processedGames / 10);
  const automaticAvailable = Math.max(0, Math.min(3, unlockedAutoPacks) - factory.automaticPacksGenerated);
  const manualRemainingThisWeek = Math.max(0, 10 - factory.manualRequestsUsed);
  const candidates = buildPackCandidates(matches);
  const gamesUntilAutoPack = Math.max(0, 10 - (processedGames % 10 || (processedGames ? 10 : 0)));

  return {
    weekKey: factory.weekKey,
    processedGames,
    gamesUntilAutoPack: processedGames >= 10 && processedGames % 10 === 0 ? 0 : gamesUntilAutoPack,
    automaticAvailable,
    automaticGeneratedThisWeek: factory.automaticPacksGenerated,
    manualRemainingThisWeek,
    manualUsedThisWeek: factory.manualRequestsUsed,
    maxManualPerWeek: 10,
    maxAutomaticPerWeek: 3,
    candidates,
    canGenerateManual: manualRemainingThisWeek > 0 && candidates.length > 0,
    canGenerateAutomatic: automaticAvailable > 0 && candidates.length > 0,
    message: candidates.length
      ? `${candidates.length} tiros candidatos listos para pack personalizado.`
      : 'Importá más replays con tiros fallados o rating ofensivo bajo para generar packs propios.',
  };
}

export function createPackDraft(matches: RocketLeagueMatch[], settings: RocketLeagueSettings, requestType: 'manual' | 'automatic'): CustomPackDraft {
  const status = getPackFactoryStatus(matches, settings);
  const canGenerate = requestType === 'manual' ? status.canGenerateManual : status.canGenerateAutomatic;
  const createdAt = new Date().toISOString();
  const shots = status.candidates.slice(0, 15);

  return {
    id: `rla-pack-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    title: requestType === 'automatic' ? 'Auto pack · multi-game analysis' : 'Manual pack · recent missed shots',
    createdAt,
    requestType,
    status: canGenerate ? 'draft' : 'blocked',
    shots: canGenerate ? shots : [],
    sourceReplayIds: [...new Set(shots.map((shot) => shot.replayId))],
    note: canGenerate
      ? 'Pack draft construido desde tus tiros fallados y tiros con rating ofensivo bajo. La app deja el archivo preparado para el instalador local.'
      : status.message,
  };
}

export function getNextFactorySettings(settings: RocketLeagueSettings, draft: CustomPackDraft): CustomPackFactorySettings {
  const current = getFactorySettings(settings);
  if (draft.status === 'blocked') return current;
  return {
    ...current,
    manualRequestsUsed: draft.requestType === 'manual' ? current.manualRequestsUsed + 1 : current.manualRequestsUsed,
    automaticPacksGenerated: draft.requestType === 'automatic' ? current.automaticPacksGenerated + 1 : current.automaticPacksGenerated,
    generatedPackIds: [...(current.generatedPackIds ?? []), draft.id].slice(-40),
    lastGeneratedAt: draft.createdAt,
  };
}
