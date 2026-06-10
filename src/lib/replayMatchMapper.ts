import type {
  DataSource,
  GameMode,
  MatchEvent,
  MatchPlayerStat,
  MatchResult,
  PlayerProfile,
  RankSnapshot,
  RocketLeagueMatch,
  SkillAreaId,
  TeamColor,
} from '../types/rocketLeague';
import type { ReplayAnalysisPreview, ReplayExtractedPlayer } from './electronBridge';
import { diagnoseMatch } from './diagnostics';

const REPLAY_MATCH_SOURCE: DataSource = 'replay_parser';

function createReplayId(prefix: string, source: string) {
  const cleanSource = source.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 72) || `${Date.now()}`;
  return `${prefix}-${cleanSource}`;
}

function getStableReplaySource(analysis: ReplayAnalysisPreview): string {
  const extract = analysis.replayExtract;
  return (
    extract?.metadata.matchGuid ||
    extract?.metadata.replayId ||
    analysis.replayPath ||
    analysis.replayId ||
    analysis.fileName
  );
}

function normalizeTeam(team: ReplayExtractedPlayer['team'] | string): TeamColor {
  if (team === 'Blue') return 'blue';
  if (team === 'Orange') return 'orange';
  return 'neutral';
}

function normalizeMode(playlist: string, fallback: GameMode): GameMode {
  const value = playlist.toLowerCase();
  if (value.includes('1v1')) return '1v1';
  if (value.includes('2v2')) return '2v2';
  if (value.includes('3v3')) return '3v3';
  return fallback === '1v1' || fallback === '2v2' || fallback === '3v3' ? fallback : '2v2';
}

function normalizeReplayDate(dateText: string): string {
  if (!dateText) return new Date().toISOString();

  const trimmed = dateText.trim();
  const rocketLeagueDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})$/);
  if (rocketLeagueDate) {
    const [, year, month, day, hour, minute, second] = rocketLeagueDate;
    const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function selectPrimaryPlayer(players: ReplayExtractedPlayer[], profile: PlayerProfile): ReplayExtractedPlayer | null {
  if (!players.length) return null;

  const profileName = profile.playerName.trim().toLowerCase();
  const profileMatch = players.find((player) => player.name.trim().toLowerCase() === profileName);
  if (profileMatch) return profileMatch;

  const epicPlayer = players.find((player) => player.source.toLowerCase().includes('epic'));
  if (epicPlayer) return epicPlayer;

  const bluePlayers = players.filter((player) => player.team === 'Blue');
  if (bluePlayers.length) return [...bluePlayers].sort((a, b) => b.score - a.score)[0] ?? null;

  return [...players].sort((a, b) => b.score - a.score)[0] ?? null;
}

function getResult(primaryTeam: TeamColor, blueScore: number, orangeScore: number): MatchResult {
  if (primaryTeam === 'neutral') return 'sin_registro';
  const ownScore = primaryTeam === 'blue' ? blueScore : orangeScore;
  const rivalScore = primaryTeam === 'blue' ? orangeScore : blueScore;
  if (ownScore > rivalScore) return 'victoria';
  if (ownScore < rivalScore) return 'derrota';
  return 'empate';
}

function makeRankSnapshot(profile: PlayerProfile, playedAt: string): RankSnapshot {
  return {
    ...profile.rank,
    id: createReplayId('rank-replay', playedAt),
    capturedAt: playedAt,
    playlist: profile.mainMode,
    mmrDelta: 0,
    source: REPLAY_MATCH_SOURCE,
  };
}

function mapPlayers(players: ReplayExtractedPlayer[]): MatchPlayerStat[] {
  return players.map((player) => ({
    id: player.id,
    playerName: player.name,
    team: normalizeTeam(player.team),
    car: '',
    goals: player.goals,
    assists: player.assists,
    saves: player.saves,
    shots: player.shots,
    demos: player.demos,
    score: player.score,
  }));
}

function mapEvents(analysis: ReplayAnalysisPreview, primaryTeam: TeamColor): MatchEvent[] {
  const replayExtract = analysis.replayExtract;
  if (!replayExtract) return [];

  return replayExtract.events.map((event) => {
    const eventTeam = normalizeTeam(event.team);
    const isPrimaryTeam = primaryTeam !== 'neutral' && eventTeam === primaryTeam;
    const eventType: MatchEvent['type'] = event.type === 'goal' ? (isPrimaryTeam ? 'goal_for' : 'goal_against') : 'mistake';

    return {
      id: `${analysis.replayId}-${event.id}`,
      matchId: createReplayId('match-replay', analysis.replayId),
      timestampSecond: event.timestampSecond,
      type: eventType,
      team: eventTeam,
      playerName: event.playerName,
      description: event.description,
      value: 1,
      source: REPLAY_MATCH_SOURCE,
    };
  });
}

function inferAffectedArea(result: MatchResult, primaryPlayer: ReplayExtractedPlayer | null, goalsAgainst: number): SkillAreaId {
  if (!primaryPlayer) return 'positioning';
  if (result === 'derrota' && goalsAgainst >= 3) return 'defence';
  if (primaryPlayer.shots >= 3 && primaryPlayer.goals === 0) return 'offence';
  if (goalsAgainst > 0 && primaryPlayer.saves === 0) return 'positioning';
  return 'rotation';
}

function buildLesson(result: MatchResult, primaryPlayer: ReplayExtractedPlayer | null, goalsAgainst: number): string {
  if (!primaryPlayer) return 'El replay fue importado, pero todavía falta confirmar cuál jugador corresponde al perfil local.';
  if (result === 'victoria') return `Buena partida para revisar presión ofensiva: ${primaryPlayer.goals} goles, ${primaryPlayer.assists} asistencias y ${primaryPlayer.shots} tiros.`;
  if (goalsAgainst >= 3) return 'Prioridad de revisión: goles concedidos, distancia al segundo hombre y recuperación después de atacar.';
  return 'Revisar decisiones clave: challenges, recuperación y calidad de tiros antes de repetir ranked.';
}

export function buildMatchFromReplayAnalysis(analysis: ReplayAnalysisPreview, profile: PlayerProfile): RocketLeagueMatch | null {
  const extract = analysis.replayExtract;
  if (!extract || analysis.status === 'error' || !extract.players.length) return null;

  const primaryPlayer = selectPrimaryPlayer(extract.players, profile);
  const primaryTeam = primaryPlayer ? normalizeTeam(primaryPlayer.team) : 'neutral';
  const blueScore = extract.score.blue;
  const orangeScore = extract.score.orange;
  const result = getResult(primaryTeam, blueScore, orangeScore);
  const ownScore = primaryTeam === 'orange' ? orangeScore : blueScore;
  const rivalScore = primaryTeam === 'orange' ? blueScore : orangeScore;
  const goalsAgainst = primaryTeam === 'neutral' ? 0 : rivalScore;
  const playedAt = normalizeReplayDate(extract.metadata.date);
  const mode = normalizeMode(extract.metadata.playlist, profile.mainMode);
  const affectedAreaId = inferAffectedArea(result, primaryPlayer, goalsAgainst);
  const stableReplaySource = getStableReplaySource(analysis);
  const replayMatchId = createReplayId('match-replay', stableReplaySource);
  const events = mapEvents(analysis, primaryTeam).map((event) => ({ ...event, matchId: replayMatchId }));

  const baseMatch: RocketLeagueMatch = {
    id: replayMatchId,
    playedAt,
    mapName: extract.metadata.mapName || 'Mapa no detectado',
    mode,
    playlist: extract.metadata.playlist || mode,
    matchType: 'Replay Review',
    result,
    teamColor: primaryTeam,
    durationSeconds: extract.metadata.durationSeconds || 0,
    score: {
      blue: blueScore,
      orange: orangeScore,
    },
    playerStats: {
      goals: primaryPlayer?.goals ?? 0,
      assists: primaryPlayer?.assists ?? 0,
      saves: primaryPlayer?.saves ?? 0,
      shots: primaryPlayer?.shots ?? 0,
      demos: primaryPlayer?.demos ?? 0,
      score: primaryPlayer?.score ?? 0,
    },
    performance: {
      avgSpeed: 0,
      boostCollected: 0,
      boostWasted: 0,
      shootingAccuracy: primaryPlayer?.shots ? Math.round((primaryPlayer.goals / primaryPlayer.shots) * 100) : 0,
      possessionPressure: ownScore > rivalScore ? 60 : 0,
      defensiveErrors: goalsAgainst,
      overcommitCount: 0,
    },
    rankSnapshot: makeRankSnapshot(profile, playedAt),
    mmrBefore: profile.rank.mmr,
    mmrAfter: profile.rank.mmr,
    events,
    players: mapPlayers(extract.players),
    personalMetrics: {
      movement: 0,
      boost: 0,
      offence: primaryPlayer?.shots ? Math.min(100, Math.round((primaryPlayer.goals / Math.max(1, primaryPlayer.shots)) * 70 + Math.min(primaryPlayer.shots * 6, 30))) : 0,
      defence: primaryPlayer?.saves ? Math.min(100, 45 + primaryPlayer.saves * 15) : 0,
      rotation: 0,
      positioning: goalsAgainst === 0 ? 60 : Math.max(0, 60 - goalsAgainst * 12),
    },
    quickObservation: primaryPlayer
      ? `${primaryPlayer.name}: ${primaryPlayer.goals}G / ${primaryPlayer.assists}A / ${primaryPlayer.saves}S / ${primaryPlayer.shots}T.`
      : 'Replay importado sin jugador principal confirmado.',
    mainErrorId: result === 'derrota' ? 'replay-review-needed' : '',
    mainErrorTitle: result === 'derrota' ? 'Revisar goles concedidos' : 'Sin error crítico detectado desde header',
    affectedAreaId,
    recommendedFocusAreaId: affectedAreaId,
    recommendedFocus: result === 'victoria' ? 'Revisar cómo se generaron los goles y repetir el patrón de presión.' : 'Hacer replay review de los goles concedidos y anotar la primera mala decisión antes del gol.',
    lesson: buildLesson(result, primaryPlayer, goalsAgainst),
    nextTrainingAction: result === 'victoria' ? '10 min de tiros simples + 1 replay review corto para repetir buenas decisiones.' : '15 min replay review + 10 min de defensa con objetivo de no entrar tarde al challenge.',
    notes: `Importado automáticamente desde replay. Parser: ${analysis.parserUsed ?? 'rattletrap'}. JSON: ${analysis.jsonPath ?? 'sin ruta'}.`,
    tags: Array.from(new Set(['replay', 'auto-import', extract.metadata.schema || 'rattletrap', extract.metadata.matchGuid ? `match:${extract.metadata.matchGuid}` : '', extract.metadata.replayId ? `replay:${extract.metadata.replayId}` : ''].filter(Boolean))),
    source: REPLAY_MATCH_SOURCE,
    replayId: extract.metadata.replayId || analysis.replayId,
    replayFileName: analysis.fileName,
    replayPath: analysis.replayPath,
    replayJsonPath: analysis.jsonPath,
    parserUsed: analysis.parserUsed,
    importedAt: new Date().toISOString(),
  };

  const diagnosis = diagnoseMatch(baseMatch);

  return {
    ...baseMatch,
    personalMetrics: {
      movement: baseMatch.personalMetrics?.movement ?? 0,
      boost: baseMatch.personalMetrics?.boost ?? 0,
      offence: diagnosis.scores.offence ?? baseMatch.personalMetrics?.offence ?? 0,
      defence: diagnosis.scores.defence ?? baseMatch.personalMetrics?.defence ?? 0,
      rotation: diagnosis.scores.rotation ?? baseMatch.personalMetrics?.rotation ?? 0,
      positioning: diagnosis.scores.positioning ?? baseMatch.personalMetrics?.positioning ?? 0,
    },
    mainErrorId: diagnosis.mainErrorId,
    mainErrorTitle: diagnosis.mainErrorTitle,
    affectedAreaId: diagnosis.primaryAreaId,
    recommendedFocusAreaId: diagnosis.primaryAreaId,
    recommendedFocus: diagnosis.recommendedFocus,
    quickObservation: diagnosis.summary,
    lesson: diagnosis.lesson,
    nextTrainingAction: diagnosis.nextTrainingAction,
    tags: Array.from(new Set([...baseMatch.tags, 'diagnosticado'])),
  };
}
