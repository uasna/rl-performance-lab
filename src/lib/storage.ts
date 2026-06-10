import { CURRENT_SCHEMA_VERSION, initialRocketLeagueData } from '../data';
import type { RocketLeagueDataStore, RocketLeagueSettings, StorageEnvelope } from '../types/rocketLeague';

export const ROCKET_LEAGUE_STORAGE_KEY = 'rl-performance-lab.store.v12';
const LEGACY_STORAGE_KEYS: string[] = [
  'rl-performance-lab.store.v11',
  'rl-performance-lab.store.v10',
  'rl-performance-lab.store.v9',
  'rl-performance-lab.store.v8',
  'rl-performance-lab.store.v7',
];

function isBrowserStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function cloneStore(store: RocketLeagueDataStore): RocketLeagueDataStore {
  return JSON.parse(JSON.stringify(store)) as RocketLeagueDataStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function unwrapEnvelope(value: unknown): unknown {
  if (isRecord(value) && value.app === 'RL Performance Lab' && 'data' in value) {
    return value.data;
  }
  return value;
}

function arrayOrDefault<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function sanitizeRocketLeagueStore(candidate: unknown): RocketLeagueDataStore {
  const fallback = cloneStore(initialRocketLeagueData);
  const value = unwrapEnvelope(candidate);

  if (!isRecord(value)) return fallback;

  const profile = isRecord(value.profile) ? { ...fallback.profile, ...value.profile } : fallback.profile;
  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const rawEpicAccount = isRecord(rawSettings.epicAccount) ? rawSettings.epicAccount : {};
  const rawLiveStatsApi = isRecord(rawSettings.liveStatsApi) ? rawSettings.liveStatsApi : {};
  const rawCustomPackFactory = isRecord(rawSettings.customPackFactory) ? rawSettings.customPackFactory : {};
  const rawMmrOcr = isRecord(rawSettings.mmrOcr) ? rawSettings.mmrOcr : {};
  const settings: RocketLeagueSettings = {
    ...fallback.settings,
    ...rawSettings,
    epicAccount: { ...(fallback.settings.epicAccount ?? {}), ...rawEpicAccount } as NonNullable<RocketLeagueSettings['epicAccount']>,
    liveStatsApi: { ...(fallback.settings.liveStatsApi ?? {}), ...rawLiveStatsApi } as NonNullable<RocketLeagueSettings['liveStatsApi']>,
    mmrOcr: { ...(fallback.settings.mmrOcr ?? {}), ...rawMmrOcr } as NonNullable<RocketLeagueSettings['mmrOcr']>,
    customPackFactory: { ...(fallback.settings.customPackFactory ?? {}), ...rawCustomPackFactory } as NonNullable<RocketLeagueSettings['customPackFactory']>,
    updatedAt: new Date().toISOString(),
  };
  const rank = isRecord(profile.rank) ? { ...fallback.profile.rank, ...profile.rank } : fallback.profile.rank;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: { ...profile, rank },
    matches: arrayOrDefault(value.matches, fallback.matches),
    trainingSessions: arrayOrDefault(value.trainingSessions, fallback.trainingSessions),
    skillAreas: arrayOrDefault(value.skillAreas, fallback.skillAreas),
    skillMetrics: arrayOrDefault(value.skillMetrics, fallback.skillMetrics),
    frequentErrors: arrayOrDefault(value.frequentErrors, fallback.frequentErrors),
    rankHistory: arrayOrDefault(value.rankHistory, fallback.rankHistory),
    playlistRanks: arrayOrDefault(value.playlistRanks, fallback.playlistRanks),
    dailyProgress: arrayOrDefault(value.dailyProgress, fallback.dailyProgress),
    weeklyProgress: arrayOrDefault(value.weeklyProgress, fallback.weeklyProgress),
    monthlyProgress: arrayOrDefault(value.monthlyProgress, fallback.monthlyProgress),
    settings,
  };
}

function readRawStoredValue(): unknown {
  if (!isBrowserStorageAvailable()) return null;

  const currentValue = window.localStorage.getItem(ROCKET_LEAGUE_STORAGE_KEY);
  if (currentValue) return parseJson(currentValue);

  // Fase 16.2: reinicio intencional de datos competitivos.
  // No migramos partidas/replays/ranks anteriores a v12 para que la app arranque desde 0.
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(legacyKey);
  }

  return null;
}

function writeStore(store: RocketLeagueDataStore): RocketLeagueDataStore {
  const safeStore = sanitizeRocketLeagueStore(store);
  if (!isBrowserStorageAvailable()) return safeStore;
  window.localStorage.setItem(ROCKET_LEAGUE_STORAGE_KEY, JSON.stringify(safeStore));
  return safeStore;
}

export const storage = {
  get(): RocketLeagueDataStore {
    return sanitizeRocketLeagueStore(readRawStoredValue());
  },

  set(nextStore: RocketLeagueDataStore): RocketLeagueDataStore {
    return writeStore(nextStore);
  },

  reset(): RocketLeagueDataStore {
    const cleanStore = cloneStore(initialRocketLeagueData);
    if (isBrowserStorageAvailable()) {
      window.localStorage.setItem(ROCKET_LEAGUE_STORAGE_KEY, JSON.stringify(cleanStore));
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
    return cleanStore;
  },

  export(): string {
    const envelope: StorageEnvelope<RocketLeagueDataStore> = {
      version: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'RL Performance Lab',
      data: storage.get(),
    };

    return JSON.stringify(envelope, null, 2);
  },

  import(payload: string | unknown): RocketLeagueDataStore {
    const parsedPayload = typeof payload === 'string' ? parseJson(payload) : payload;
    const importedStore = sanitizeRocketLeagueStore(parsedPayload);
    return writeStore(importedStore);
  },
};

export function createStorageSnapshot(store: RocketLeagueDataStore): StorageEnvelope<RocketLeagueDataStore> {
  return {
    version: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'RL Performance Lab',
    data: sanitizeRocketLeagueStore(store),
  };
}
