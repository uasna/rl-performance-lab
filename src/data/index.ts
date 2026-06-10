import { mockMatches, mockPlayerProfile } from './mockMatches';
import { mockTrainingSessions } from './mockTraining';
import {
  mockDailyProgress,
  mockFrequentErrors,
  mockMonthlyProgress,
  mockRankHistory,
  mockSkillAreas,
  mockSkillMetrics,
  mockWeeklyProgress,
} from './mockMetrics';
import { defaultPlaylistRanks } from './rankPlaylists';
import type { RocketLeagueDataStore, RocketLeagueSettings } from '../types/rocketLeague';

export const CURRENT_SCHEMA_VERSION = 13;

export const defaultSettings: RocketLeagueSettings = {
  id: 'settings-hector-local',
  language: 'es',
  theme: 'dark',
  mainPlaylistFilter: 'RANKED',
  preferredTrainingMinutes: 90,
  dailyAvailableMinutes: 90,
  region: 'LATAM',
  priorityAreaIds: [],
  trackerProfileUrl: '',
  rocketLeagueProfileUrl: '',
  epicAccount: {
    status: 'desconectada',
    displayName: '',
    epicAccountId: '',
    platform: 'Epic',
    profileUrl: '',
  },
  liveStatsApi: {
    enabled: false,
    port: 49123,
    packetSendRate: 10,
    autoConnect: false,
    status: 'no_configurada',
    configPath: '',
    lastConnectedAt: '',
    lastMessageAt: '',
    lastError: '',
  },
  mmrOcr: {
    enabled: false,
    autoPromptAfterMatch: true,
    playlist: '2v2',
    roi: { x: 71, y: 72, width: 18, height: 10 },
    status: 'sin_configurar',
    lastCaptureAt: '',
    lastConfirmedMmr: 0,
    sampleCount: 0,
    notes: '',
  },
  customPackFactory: {
    weekKey: '',
    manualRequestsUsed: 0,
    automaticPacksGenerated: 0,
    generatedPackIds: [],
    stagedPackFolder: '',
    selectedMyTrainingDirectory: '',
    lastInstalledPath: '',
    lastGeneratedAt: '',
  },
  enableRankAutoSync: false,
  rankSyncIntervalMinutes: 15,
  autoSave: true,
  showMockData: false,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
};

export const initialRocketLeagueData: RocketLeagueDataStore = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  profile: mockPlayerProfile,
  matches: mockMatches,
  trainingSessions: mockTrainingSessions,
  skillAreas: mockSkillAreas,
  skillMetrics: mockSkillMetrics,
  frequentErrors: mockFrequentErrors,
  rankHistory: mockRankHistory,
  playlistRanks: defaultPlaylistRanks,
  dailyProgress: mockDailyProgress,
  weeklyProgress: mockWeeklyProgress,
  monthlyProgress: mockMonthlyProgress,
  settings: defaultSettings,
};

export * from './mockMatches';
export * from './mockTraining';
export * from './mockMetrics';

export * from './trainingPacks';

export * from './rankPlaylists';
