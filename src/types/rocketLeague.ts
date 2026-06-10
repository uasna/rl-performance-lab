export type GameTitle = 'Rocket League';
export type GameMode = '1v1' | '2v2' | '3v3' | 'Casual' | 'Torneo' | 'Libre';
export type MatchType = 'Casual' | 'Ranked' | 'Private' | 'Replay Review';
export type MatchResult = 'victoria' | 'derrota' | 'empate' | 'sin_registro';
export type TeamColor = 'blue' | 'orange' | 'neutral';
export type TrendDirection = 'up' | 'down' | 'stable';
export type ImprovementState = 'improving' | 'stable' | 'declining';
export type SkillAreaId = 'movement' | 'boost' | 'offence' | 'defence' | 'rotation' | 'positioning' | 'mechanics' | 'kickoffs' | 'mental';
export type FrequentErrorSeverity = 'baja' | 'media' | 'alta' | 'critica';
export type ErrorStatus = 'activo' | 'bajando' | 'resuelto';
export type TrainingBlockStatus = 'pendiente' | 'en_progreso' | 'completado' | 'omitido';
export type DataSource = 'mock' | 'manual' | 'api' | 'replay_parser' | 'system' | 'tracker' | 'rocketleague_profile' | 'launch_log' | 'epic_account' | 'stats_api_live' | 'custom_pack_factory' | 'local_ocr';

export type TrainingPackSourceType = 'official_featured' | 'pro_featured' | 'community_index' | 'manual';
export type TrainingPackDifficulty = 'baja' | 'media' | 'alta';

export interface TrainingPack {
  id: string;
  name: string;
  creator: string;
  code: string;
  sourceName: string;
  sourceType: TrainingPackSourceType;
  areaIds: SkillAreaId[];
  weaknessTags: string[];
  rankMin: string;
  rankMax: string;
  difficulty: TrainingPackDifficulty;
  durationMinutes: number;
  shots?: number;
  objective: string;
  instructions: string[];
  isInternalCustomTraining: boolean;
}

export interface TrainingPackRecommendation {
  pack: TrainingPack;
  score: number;
  reasons: string[];
  matchedTags: string[];
  priority: 'principal' | 'alternativo' | 'extra';
}

export interface RankSnapshot {
  id: string;
  capturedAt: string;
  playlist: GameMode;
  tier: string;
  division: string;
  mmr: number;
  mmrDelta: number;
  gamesToNextRank: number;
  progressToNextRank: number;
  source: DataSource;
}

export type RankSyncStatus = 'sin_configurar' | 'manual' | 'sincronizado' | 'error' | 'experimental';

export interface PlaylistRank {
  id: string;
  playlist: GameMode;
  label: string;
  tier: string;
  division: string;
  mmr: number;
  mmrDelta: number;
  gamesToNextRank: number;
  progressToNextRank: number;
  wins: number;
  losses: number;
  streak: number;
  source: DataSource;
  status: RankSyncStatus;
  profileUrl?: string;
  lastUpdatedAt: string;
  notes?: string;
}

export interface RankLogScanResult {
  ok: boolean;
  scannedAt: string;
  logPath: string;
  message: string;
  snapshots: RankSnapshot[];
  evidenceLines: string[];
}

export interface SkillArea {
  id: SkillAreaId;
  name: string;
  description: string;
  category: 'fundamental' | 'mecanica' | 'mental' | 'competitiva';
  isStrongArea: boolean;
  isWeakArea: boolean;
  currentScore: number;
  targetScore: number;
  trend: TrendDirection;
  recommendedMinutes: number;
}

export interface SkillMetric {
  id: string;
  areaId: SkillAreaId;
  label: string;
  value: number;
  target: number;
  unit: 'puntos' | 'porcentaje' | 'mmr' | 'minutos' | 'conteo';
  trend: TrendDirection;
  source: DataSource;
}

export interface FrequentError {
  id: string;
  areaId: SkillAreaId;
  title: string;
  description: string;
  severity: FrequentErrorSeverity;
  appearances: number;
  lastSeenAt: string;
  impactScore: number;
  suggestedFix: string;
  suggestedDrill?: string;
  status?: ErrorStatus;
}

export interface PlayerProfile {
  id: string;
  playerName: string;
  region?: string;
  primaryModes?: GameMode[];
  game: GameTitle;
  goal: string;
  mainMode: GameMode;
  rank: RankSnapshot;
  strongAreas: SkillAreaId[];
  weakAreas: SkillAreaId[];
  mainFrequentErrorId: string;
  recommendedTrainingMinutes: number;
  createdAt: string;
  updatedAt: string;
  source: DataSource;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  timestampSecond: number;
  type: 'goal_for' | 'goal_against' | 'save' | 'shot' | 'assist' | 'demo' | 'miss' | 'overcommit' | 'bad_challenge' | 'boost_starvation' | 'mistake' | 'rotation' | 'boost_pickup';
  team: TeamColor;
  playerName: string;
  description: string;
  value: number;
  source: DataSource;
}


export interface MatchPlayerStat {
  id: string;
  playerName: string;
  team: TeamColor;
  car: string;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  score: number;
}

export interface MatchSkillSnapshot {
  movement: number;
  boost: number;
  offence: number;
  defence: number;
  rotation: number;
  positioning: number;
}

export interface RocketLeagueMatch {
  id: string;
  playedAt: string;
  mapName: string;
  mode: GameMode;
  playlist: string;
  matchType?: MatchType;
  result: MatchResult;
  teamColor: TeamColor;
  durationSeconds: number;
  score: {
    blue: number;
    orange: number;
  };
  playerStats: {
    goals: number;
    assists: number;
    saves: number;
    shots: number;
    demos: number;
    score: number;
  };
  performance: {
    avgSpeed: number;
    boostCollected: number;
    boostWasted: number;
    shootingAccuracy: number;
    possessionPressure: number;
    defensiveErrors: number;
    overcommitCount: number;
  };
  rankSnapshot: RankSnapshot;
  mmrBefore?: number;
  mmrAfter?: number;
  events: MatchEvent[];
  players?: MatchPlayerStat[];
  personalMetrics?: MatchSkillSnapshot;
  quickObservation?: string;
  mainErrorId?: string;
  mainErrorTitle?: string;
  affectedAreaId?: SkillAreaId;
  recommendedFocusAreaId?: SkillAreaId;
  recommendedFocus?: string;
  lesson?: string;
  nextTrainingAction?: string;
  notes: string;
  tags: string[];
  source: DataSource;
  replayId?: string;
  replayFileName?: string;
  replayPath?: string;
  replayJsonPath?: string;
  parserUsed?: 'rattletrap' | 'rrrocket' | 'partial';
  importedAt?: string;
}

export interface TrainingBlock {
  id: string;
  areaId: SkillAreaId;
  title: string;
  description: string;
  durationMinutes: number;
  targetRepetitions: number;
  completedRepetitions: number;
  status: TrainingBlockStatus;
  trainingPackCode: string;
  trainingPackId?: string;
  source: DataSource;
  blockType?: 'freeplay' | 'training_pack' | 'replay_review' | 'casual_objective' | 'ranked_objective' | 'duel_objective' | 'rest';
  objective?: string;
}

export interface TrainingSession {
  id: string;
  startedAt: string;
  endedAt: string;
  title: string;
  focusAreaId: SkillAreaId;
  durationMinutes: number;
  blocks: TrainingBlock[];
  perceivedDifficulty: number;
  perceivedEnergy: number;
  focusScore: number;
  consistencyScore: number;
  notes: string;
  visibleResult?: string;
  source: DataSource;
}

export interface DailyProgress {
  id: string;
  date: string;
  playedMatches: number;
  wins: number;
  losses: number;
  draws: number;
  trainingMinutes: number;
  mmrStart: number;
  mmrEnd: number;
  mmrDelta: number;
  completedBlocks: number;
  totalBlocks: number;
  focusAreaId: SkillAreaId;
  summary: string;
  source: DataSource;
}

export interface EpicAccountConnection {
  status: 'desconectada' | 'preparada' | 'conectada' | 'error';
  displayName: string;
  epicAccountId: string;
  platform: 'Epic' | 'Steam' | 'PlayStation' | 'Xbox' | 'Switch' | 'Desconocida';
  profileUrl: string;
  connectedAt?: string;
  lastSyncAt?: string;
  notes?: string;
}

export interface CustomPackFactorySettings {
  weekKey: string;
  manualRequestsUsed: number;
  automaticPacksGenerated: number;
  generatedPackIds: string[];
  stagedPackFolder?: string;
  selectedMyTrainingDirectory?: string;
  lastInstalledPath?: string;
  lastGeneratedAt?: string;
}

export interface LiveStatsApiSettings {
  enabled: boolean;
  port: number;
  packetSendRate: number;
  autoConnect: boolean;
  status: 'no_configurada' | 'configurada' | 'conectando' | 'conectada' | 'error';
  configPath?: string;
  lastConnectedAt?: string;
  lastMessageAt?: string;
  lastError?: string;
}

export interface LiveStatsSnapshot {
  id: string;
  capturedAt: string;
  event: string;
  matchGuid?: string;
  arena?: string;
  timeSeconds?: number;
  elapsed?: number;
  blueScore?: number;
  orangeScore?: number;
  targetName?: string;
  targetPrimaryId?: string;
  targetTeamNum?: number;
  targetSpeed?: number;
  targetBoost?: number;
  targetSupersonic?: boolean;
  touches?: number;
  shots?: number;
  saves?: number;
  goals?: number;
  demos?: number;
}


export interface MmrOcrSettings {
  enabled: boolean;
  autoPromptAfterMatch: boolean;
  playlist: GameMode;
  roi: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  status: 'sin_configurar' | 'calibrando' | 'listo' | 'error';
  lastCaptureAt?: string;
  lastConfirmedMmr?: number;
  sampleCount?: number;
  notes?: string;
}

export interface RocketLeagueSettings {
  id: string;
  language: 'es';
  theme: 'dark';
  mainPlaylistFilter: GameMode | 'ALL' | 'RANKED';
  preferredTrainingMinutes: number;
  dailyAvailableMinutes?: number;
  region?: string;
  priorityAreaIds?: SkillAreaId[];
  trackerProfileUrl?: string;
  rocketLeagueProfileUrl?: string;
  epicAccount?: EpicAccountConnection;
  liveStatsApi?: LiveStatsApiSettings;
  mmrOcr?: MmrOcrSettings;
  customPackFactory?: CustomPackFactorySettings;
  enableRankAutoSync?: boolean;
  rankSyncIntervalMinutes?: number;
  autoSave: boolean;
  showMockData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RocketLeagueDataStore {
  schemaVersion: number;
  profile: PlayerProfile;
  matches: RocketLeagueMatch[];
  trainingSessions: TrainingSession[];
  skillAreas: SkillArea[];
  skillMetrics: SkillMetric[];
  frequentErrors: FrequentError[];
  rankHistory: RankSnapshot[];
  playlistRanks: PlaylistRank[];
  dailyProgress: DailyProgress[];
  weeklyProgress: DailyProgress[];
  monthlyProgress: DailyProgress[];
  settings: RocketLeagueSettings;
}

export interface StorageEnvelope<T> {
  version: number;
  exportedAt: string;
  app: 'RL Performance Lab';
  data: T;
}

export interface TrainingRecommendation {
  areaId: SkillAreaId;
  title: string;
  reason: string;
  suggestedMinutes: number;
  priority: FrequentErrorSeverity;
  trainingPackCode: string;
  trainingPackName?: string;
  trainingPackCreator?: string;
}

export interface DerivedRocketLeagueMetrics {
  record: {
    wins: number;
    losses: number;
    draws: number;
  };
  winRate: number;
  mmrDelta: number;
  mmrTrend: TrendDirection;
  skillAverage: number;
  strongestArea: SkillArea | null;
  weakestArea: SkillArea | null;
  mostFrequentError: FrequentError | null;
  trainingRecommendation: TrainingRecommendation | null;
  weeklyConsistency: number;
  last7DaysProgress: DailyProgress[];
  last30DaysProgress: DailyProgress[];
  improvementState: ImprovementState;
  totalTrainingMinutes: number;
  weeklyTotals: {
    playedMatches: number;
    wins: number;
    losses: number;
    draws: number;
    trainingMinutes: number;
    mmrDelta: number;
    completedBlocks: number;
    totalBlocks: number;
  };
  monthlyTotals: {
    playedMatches: number;
    wins: number;
    losses: number;
    draws: number;
    trainingMinutes: number;
    mmrDelta: number;
    completedBlocks: number;
    totalBlocks: number;
  };
}
