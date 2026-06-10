import { useCallback, useEffect, useMemo } from 'react';
import { calculateDerivedMetrics } from '../lib/calculations';
import { applyDiagnosticsToStore } from '../lib/diagnostics';
import { mergeRankSnapshots, upsertPlaylistRank } from '../lib/rankSync';
import { ROCKET_LEAGUE_STORAGE_KEY, sanitizeRocketLeagueStore, storage } from '../lib/storage';
import { useLocalStorage } from './useLocalStorage';
import type {
  DailyProgress,
  PlayerProfile,
  PlaylistRank,
  RankSnapshot,
  RocketLeagueDataStore,
  RocketLeagueMatch,
  RocketLeagueSettings,
  SkillMetric,
  TrainingSession,
} from '../types/rocketLeague';

type ImportResult = { ok: true; store: RocketLeagueDataStore } | { ok: false; error: string };

type StoreUpdater = (currentStore: RocketLeagueDataStore) => RocketLeagueDataStore;

function createId(prefix: string): string {
  const randomId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomId}`;
}


function normalizeIdentity(value?: string): string {
  return (value ?? '').trim().toLowerCase().replace(/\\/g, '/');
}

function hasSharedTag(left: RocketLeagueMatch, right: RocketLeagueMatch): boolean {
  const leftTags = new Set((left.tags ?? []).filter((tag) => tag.startsWith('match:') || tag.startsWith('replay:')));
  if (!leftTags.size) return false;
  return (right.tags ?? []).some((tag) => leftTags.has(tag));
}

function isSameReplayMatch(left: RocketLeagueMatch, right: RocketLeagueMatch): boolean {
  if (left.id && right.id && left.id === right.id) return true;
  if (left.replayId && right.replayId && left.replayId === right.replayId) return true;
  if (normalizeIdentity(left.replayJsonPath) && normalizeIdentity(left.replayJsonPath) === normalizeIdentity(right.replayJsonPath)) return true;
  if (normalizeIdentity(left.replayPath) && normalizeIdentity(left.replayPath) === normalizeIdentity(right.replayPath)) return true;
  if (hasSharedTag(left, right)) return true;

  const sameFile = Boolean(left.replayFileName && right.replayFileName && left.replayFileName === right.replayFileName);
  const sameScore = left.score.blue === right.score.blue && left.score.orange === right.score.orange;
  const sameContext = left.mapName === right.mapName && left.mode === right.mode && left.playedAt === right.playedAt;
  return sameFile && sameScore && sameContext;
}

function withUpdatedTimestamp(store: RocketLeagueDataStore): RocketLeagueDataStore {
  const now = new Date().toISOString();
  return {
    ...store,
    profile: {
      ...store.profile,
      updatedAt: now,
    },
    settings: {
      ...store.settings,
      updatedAt: now,
    },
  };
}

function createDiagnosticsSignature(store: RocketLeagueDataStore): string {
  return JSON.stringify({
    matches: store.matches.map((match) => ({
      id: match.id,
      source: match.source,
      mainErrorId: match.mainErrorId ?? '',
      mainErrorTitle: match.mainErrorTitle ?? '',
      affectedAreaId: match.affectedAreaId ?? '',
      recommendedFocusAreaId: match.recommendedFocusAreaId ?? '',
      personalMetrics: match.personalMetrics ?? null,
      quickObservation: match.quickObservation ?? '',
      lesson: match.lesson ?? '',
      nextTrainingAction: match.nextTrainingAction ?? '',
      tags: match.tags,
    })),
    skillAreas: store.skillAreas.map((area) => ({
      id: area.id,
      currentScore: area.currentScore,
      targetScore: area.targetScore,
      trend: area.trend,
      isStrongArea: area.isStrongArea,
      isWeakArea: area.isWeakArea,
      recommendedMinutes: area.recommendedMinutes,
    })),
    skillMetrics: store.skillMetrics.map((metric) => ({
      id: metric.id,
      value: metric.value,
      target: metric.target,
      trend: metric.trend,
      source: metric.source,
    })),
    frequentErrors: store.frequentErrors.map((error) => ({
      id: error.id,
      appearances: error.appearances,
      impactScore: error.impactScore,
      lastSeenAt: error.lastSeenAt,
      severity: error.severity,
      status: error.status,
    })),
    dailyProgress: store.dailyProgress.map((day) => ({
      id: day.id,
      date: day.date,
      playedMatches: day.playedMatches,
      wins: day.wins,
      losses: day.losses,
      draws: day.draws,
      trainingMinutes: day.trainingMinutes,
      mmrDelta: day.mmrDelta,
      focusAreaId: day.focusAreaId,
      source: day.source,
    })),
    profile: {
      strongAreas: store.profile.strongAreas,
      weakAreas: store.profile.weakAreas,
      mainFrequentErrorId: store.profile.mainFrequentErrorId,
      mainMode: store.profile.mainMode,
    },
  });
}

export function useRocketLeagueStats() {
  const [store, setStoredValue] = useLocalStorage<RocketLeagueDataStore>(ROCKET_LEAGUE_STORAGE_KEY, storage.get(), {
    deserialize: (value) => sanitizeRocketLeagueStore(JSON.parse(value) as unknown),
    serialize: (value) => JSON.stringify(sanitizeRocketLeagueStore(value)),
    onError: (error) => console.warn('RL Performance Lab no pudo sincronizar localStorage.', error),
  });

  const updateStore = useCallback(
    (updater: StoreUpdater) => {
      setStoredValue((currentStore) => storage.set(withUpdatedTimestamp(updater(sanitizeRocketLeagueStore(currentStore)))));
    },
    [setStoredValue],
  );

  const calculatedMetrics = useMemo(() => calculateDerivedMetrics(store), [store]);


  useEffect(() => {
    const safeStore = sanitizeRocketLeagueStore(store);
    if (!safeStore.matches.length) return;

    const recalculatedStore = applyDiagnosticsToStore(safeStore);
    if (createDiagnosticsSignature(safeStore) === createDiagnosticsSignature(recalculatedStore)) return;

    setStoredValue(storage.set(withUpdatedTimestamp(recalculatedStore)));
  }, [setStoredValue, store]);

  const recalculateDiagnostics = useCallback(() => {
    updateStore((currentStore) => applyDiagnosticsToStore(sanitizeRocketLeagueStore(currentStore)));
  }, [updateStore]);

  const registerMatch = useCallback(
    (match: RocketLeagueMatch) => {
      updateStore((currentStore) => {
        const normalizedMatch: RocketLeagueMatch = {
          ...match,
          id: match.id || createId('match'),
          source: match.source ?? 'manual',
        };

        const existingMatchIndex = currentStore.matches.findIndex((storedMatch) => isSameReplayMatch(storedMatch, normalizedMatch));

        const nextMatches = existingMatchIndex >= 0
          ? currentStore.matches.map((storedMatch, index) => (index === existingMatchIndex ? normalizedMatch : storedMatch))
          : [normalizedMatch, ...currentStore.matches];

        const nextRankHistory = currentStore.rankHistory.some((snapshot) => snapshot.id === normalizedMatch.rankSnapshot.id)
          ? currentStore.rankHistory.map((snapshot) => (snapshot.id === normalizedMatch.rankSnapshot.id ? normalizedMatch.rankSnapshot : snapshot))
          : [...currentStore.rankHistory, normalizedMatch.rankSnapshot];

        return applyDiagnosticsToStore({
          ...currentStore,
          profile: {
            ...currentStore.profile,
            rank: normalizedMatch.rankSnapshot,
          },
          matches: nextMatches,
          rankHistory: nextRankHistory,
        });
      });
    },
    [updateStore],
  );

  const registerTrainingSession = useCallback(
    (session: TrainingSession) => {
      updateStore((currentStore) => ({
        ...currentStore,
        trainingSessions: [
          {
            ...session,
            id: session.id || createId('training-session'),
            source: session.source ?? 'manual',
          },
          ...currentStore.trainingSessions,
        ],
      }));
    },
    [updateStore],
  );

  const registerDailyProgress = useCallback(
    (progress: DailyProgress) => {
      updateStore((currentStore) => ({
        ...currentStore,
        dailyProgress: [progress, ...currentStore.dailyProgress.filter((day) => day.date !== progress.date)],
      }));
    },
    [updateStore],
  );

  const updateProfile = useCallback(
    (nextProfile: Partial<PlayerProfile>) => {
      updateStore((currentStore) => ({
        ...currentStore,
        profile: {
          ...currentStore.profile,
          ...nextProfile,
        },
      }));
    },
    [updateStore],
  );

  const updateSkillMetric = useCallback(
    (metricId: string, nextMetric: Partial<SkillMetric>) => {
      updateStore((currentStore) => ({
        ...currentStore,
        skillMetrics: currentStore.skillMetrics.map((metric) => (metric.id === metricId ? { ...metric, ...nextMetric, source: 'manual' } : metric)),
      }));
    },
    [updateStore],
  );

  const updateSettings = useCallback(
    (nextSettings: Partial<RocketLeagueSettings>) => {
      updateStore((currentStore) => ({
        ...currentStore,
        settings: {
          ...currentStore.settings,
          ...nextSettings,
          language: 'es',
          theme: 'dark',
        },
      }));
    },
    [updateStore],
  );

  const updatePlaylistRank = useCallback(
    (rank: PlaylistRank) => {
      updateStore((currentStore) => upsertPlaylistRank(currentStore, rank));
    },
    [updateStore],
  );

  const mergeRankLogSnapshots = useCallback(
    (snapshots: RankSnapshot[]) => {
      updateStore((currentStore) => mergeRankSnapshots(currentStore, snapshots));
    },
    [updateStore],
  );

  const exportData = useCallback(() => storage.export(), []);

  const importData = useCallback(
    (payload: string | unknown): ImportResult => {
      try {
        const importedStore = storage.import(payload);
        setStoredValue(importedStore);
        return { ok: true, store: importedStore };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'No se pudo importar el archivo de datos.',
        };
      }
    },
    [setStoredValue],
  );

  const resetData = useCallback(() => {
    const cleanStore = storage.reset();
    setStoredValue(cleanStore);
  }, [setStoredValue]);

  return {
    store,
    profile: store.profile,
    matches: store.matches,
    trainingSessions: store.trainingSessions,
    settings: store.settings,
    calculatedMetrics,
    summary: calculatedMetrics,
    actions: {
      registerMatch,
      registerTrainingSession,
      registerDailyProgress,
      updateProfile,
      updateSkillMetric,
      updateSettings,
      updatePlaylistRank,
      mergeRankLogSnapshots,
      exportData,
      importData,
      resetData,
      recalculateDiagnostics,
    },
    setStore: updateStore,
    resetMockData: resetData,
  };
}
