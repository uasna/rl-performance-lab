import { createRankId, getPlaylistLabel, normalizePlaylistRanks } from '../../lib/rankSync';
import type { GameMode, PlaylistRank, RocketLeagueSettings } from '../../types/rocketLeague';

type RankedPlaylist = Extract<GameMode, '1v1' | '2v2' | '3v3'>;

const PLAYLISTS: RankedPlaylist[] = ['1v1', '2v2', '3v3'];

export type TrackerAutomationSettings = {
  epicUsername?: string;
  autoParseNewReplays?: boolean;
  replayWatcherWasActive?: boolean;
  enableRankAutoSync?: boolean;
  lastLocalMmrSyncAt?: string;
  lastReplayAutomationAt?: string;
  // Legacy fields are kept only so older localStorage data does not crash the app.
  trackerApiKey?: string;
  trnApiKey?: string;
  lastTrackerSyncAt?: string;
};

export type TrackerSyncInput = {
  settings: RocketLeagueSettings;
  playlistRanks: PlaylistRank[];
  mainMode: GameMode;
  updatePlaylistRank: (rank: PlaylistRank) => void;
};

export type TrackerSyncResult = {
  ok: true;
  syncedAt: string;
  ranks: PlaylistRank[];
  primaryMmr: number;
  message: string;
};

function settingsRecord(settings: RocketLeagueSettings): Record<string, unknown> {
  return settings as unknown as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRankedPlaylist(value: unknown): value is RankedPlaylist {
  return value === '1v1' || value === '2v2' || value === '3v3';
}

export function getTrackerAutomationSettings(settings: RocketLeagueSettings): TrackerAutomationSettings {
  const record = settingsRecord(settings);
  const epicAccount = settings.epicAccount;
  return {
    epicUsername: readString(record.epicUsername) || epicAccount?.displayName || '',
    autoParseNewReplays: Boolean(record.autoParseNewReplays),
    replayWatcherWasActive: Boolean(record.replayWatcherWasActive),
    enableRankAutoSync: Boolean(settings.enableRankAutoSync),
    lastLocalMmrSyncAt: readString(record.lastLocalMmrSyncAt) || readString(record.lastTrackerSyncAt),
    lastReplayAutomationAt: readString(record.lastReplayAutomationAt),
    trackerApiKey: '',
    trnApiKey: '',
    lastTrackerSyncAt: readString(record.lastTrackerSyncAt),
  };
}

export function getTrackerCredentials(settings: RocketLeagueSettings) {
  const automation = getTrackerAutomationSettings(settings);
  return {
    username: automation.epicUsername || '',
    apiKey: '',
    hasCredentials: Boolean(automation.epicUsername),
  };
}

function choosePlaylist(settings: RocketLeagueSettings, mainMode: GameMode): RankedPlaylist {
  const ocrPlaylist = settings.mmrOcr?.playlist;
  if (isRankedPlaylist(ocrPlaylist)) return ocrPlaylist;
  if (isRankedPlaylist(mainMode)) return mainMode;
  if (isRankedPlaylist(settings.mainPlaylistFilter)) return settings.mainPlaylistFilter;
  return '2v2';
}

function buildLocalRank(input: TrackerSyncInput, syncedAt: string): PlaylistRank | null {
  const playlist = choosePlaylist(input.settings, input.mainMode);
  if (!PLAYLISTS.includes(playlist)) return null;

  const ranks = normalizePlaylistRanks(input.playlistRanks);
  const previous = ranks.find((rank) => rank.playlist === playlist) ?? ranks[0];
  const ocrMmr = Number(input.settings.mmrOcr?.lastConfirmedMmr || 0);
  const hasConfirmedOcr = Number.isFinite(ocrMmr) && ocrMmr > 0;
  const mmr = hasConfirmedOcr ? ocrMmr : Number(previous?.mmr || 0);

  if (!Number.isFinite(mmr) || mmr <= 0) return null;

  return {
    ...(previous ?? {
      id: createRankId(playlist),
      playlist,
      label: getPlaylistLabel(playlist),
      tier: 'Sin rango',
      division: 'Sin división',
      mmr: 0,
      mmrDelta: 0,
      gamesToNextRank: 0,
      progressToNextRank: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      source: 'manual',
      status: 'manual',
      lastUpdatedAt: syncedAt,
    }),
    playlist,
    label: getPlaylistLabel(playlist),
    mmr,
    mmrDelta: hasConfirmedOcr ? mmr - (Number(previous?.mmr) || 0) : 0,
    source: hasConfirmedOcr ? 'local_ocr' : (previous?.source || 'manual'),
    status: hasConfirmedOcr ? 'sincronizado' : (previous?.status || 'manual'),
    lastUpdatedAt: syncedAt,
    notes: hasConfirmedOcr
      ? 'Snapshot local confirmado por OCR/manual. No usa Tracker Network ni APIs externas.'
      : 'Snapshot local reutilizando el último MMR guardado. No usa Tracker Network ni APIs externas.',
  } as PlaylistRank;
}

export async function syncTrackerNetworkRanks(input: TrackerSyncInput): Promise<TrackerSyncResult> {
  const automation = getTrackerAutomationSettings(input.settings);
  const syncedAt = new Date().toISOString();

  if (!automation.enableRankAutoSync) {
    throw new Error('Auto-sync local está desactivado en Ajustes.');
  }

  if (!automation.epicUsername) {
    throw new Error('Falta tu Epic username en Ajustes.');
  }

  const rank = buildLocalRank(input, syncedAt);
  if (!rank) {
    throw new Error('No hay MMR local todavía. Guardá un snapshot desde Ajustes → Avanzado → MMR OCR local una vez.');
  }

  input.updatePlaylistRank(rank);

  return {
    ok: true,
    syncedAt,
    ranks: [rank],
    primaryMmr: rank.mmr,
    message: `MMR local actualizado: ${rank.mmr}`,
  };
}

export const syncLocalMmrSnapshot = syncTrackerNetworkRanks;
export const getLocalMmrAutomationSettings = getTrackerAutomationSettings;
