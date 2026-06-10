import { defaultPlaylistRanks } from '../data/rankPlaylists';
import type { GameMode, PlaylistRank, RankSnapshot, RocketLeagueDataStore } from '../types/rocketLeague';

const PLAYLIST_ORDER: GameMode[] = ['1v1', '2v2', '3v3'];

export function createRankId(playlist: GameMode): string {
  return `rank-${playlist}-current`;
}

export function getPlaylistLabel(playlist: GameMode): string {
  if (playlist === '1v1') return 'Ranked Duel';
  if (playlist === '2v2') return 'Ranked Doubles';
  if (playlist === '3v3') return 'Ranked Standard';
  return playlist;
}

export function normalizePlaylistRanks(ranks: PlaylistRank[] | undefined): PlaylistRank[] {
  const map = new Map((ranks ?? []).map((rank) => [rank.playlist, rank]));
  return PLAYLIST_ORDER.map((playlist) => {
    const fallback = defaultPlaylistRanks.find((rank) => rank.playlist === playlist) ?? defaultPlaylistRanks[0];
    return {
      ...fallback,
      ...(map.get(playlist) ?? {}),
      id: map.get(playlist)?.id || createRankId(playlist),
      label: map.get(playlist)?.label || getPlaylistLabel(playlist),
    };
  });
}

export function getPrimaryPlaylistRank(store: RocketLeagueDataStore): PlaylistRank {
  const ranks = normalizePlaylistRanks(store.playlistRanks);
  return ranks.find((rank) => rank.playlist === store.profile.mainMode) ?? ranks.find((rank) => rank.playlist === '2v2') ?? ranks[0];
}

export function rankSnapshotFromPlaylist(rank: PlaylistRank, previous?: RankSnapshot): RankSnapshot {
  const previousMmr = previous?.mmr ?? 0;
  return {
    id: `rank-snapshot-${rank.playlist}-${Date.now()}`,
    capturedAt: rank.lastUpdatedAt || new Date().toISOString(),
    playlist: rank.playlist,
    tier: rank.tier || 'Sin rango',
    division: rank.division || 'Sin división',
    mmr: Number(rank.mmr) || 0,
    mmrDelta: Number(rank.mmrDelta) || (Number(rank.mmr) || 0) - previousMmr,
    gamesToNextRank: Number(rank.gamesToNextRank) || 0,
    progressToNextRank: Number(rank.progressToNextRank) || 0,
    source: rank.source,
  };
}

export function upsertPlaylistRank(store: RocketLeagueDataStore, nextRank: PlaylistRank): RocketLeagueDataStore {
  const now = new Date().toISOString();
  const playlistRanks = normalizePlaylistRanks(store.playlistRanks);
  const previousRank = playlistRanks.find((rank) => rank.playlist === nextRank.playlist);
  const normalizedRank: PlaylistRank = {
    ...previousRank,
    ...nextRank,
    id: nextRank.id || createRankId(nextRank.playlist),
    label: nextRank.label || getPlaylistLabel(nextRank.playlist),
    mmr: Number(nextRank.mmr) || 0,
    mmrDelta: Number(nextRank.mmrDelta) || (Number(nextRank.mmr) || 0) - (Number(previousRank?.mmr) || 0),
    gamesToNextRank: Number(nextRank.gamesToNextRank) || 0,
    progressToNextRank: Math.max(0, Math.min(100, Number(nextRank.progressToNextRank) || 0)),
    wins: Number(nextRank.wins) || 0,
    losses: Number(nextRank.losses) || 0,
    streak: Number(nextRank.streak) || 0,
    status: nextRank.status || 'manual',
    source: nextRank.source || 'manual',
    lastUpdatedAt: nextRank.lastUpdatedAt || now,
  } as PlaylistRank;

  const nextPlaylistRanks = playlistRanks.map((rank) => (rank.playlist === normalizedRank.playlist ? normalizedRank : rank));
  const previousSnapshot = [...store.rankHistory]
    .filter((snapshot) => snapshot.playlist === normalizedRank.playlist)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
    .at(-1);
  const snapshot = rankSnapshotFromPlaylist(normalizedRank, previousSnapshot);
  const nextRankHistory = [...store.rankHistory, snapshot];
  const shouldUpdateProfile = normalizedRank.playlist === store.profile.mainMode || !store.profile.rank.mmr;

  return {
    ...store,
    playlistRanks: nextPlaylistRanks,
    rankHistory: nextRankHistory,
    profile: shouldUpdateProfile
      ? {
          ...store.profile,
          rank: snapshot,
          updatedAt: now,
        }
      : store.profile,
  };
}

export function mergeRankSnapshots(store: RocketLeagueDataStore, snapshots: RankSnapshot[]): RocketLeagueDataStore {
  return snapshots.reduce((nextStore, snapshot) => {
    const existing = normalizePlaylistRanks(nextStore.playlistRanks).find((rank) => rank.playlist === snapshot.playlist);
    return upsertPlaylistRank(nextStore, {
      ...(existing ?? defaultPlaylistRanks.find((rank) => rank.playlist === snapshot.playlist) ?? defaultPlaylistRanks[0]),
      playlist: snapshot.playlist,
      label: getPlaylistLabel(snapshot.playlist),
      tier: snapshot.tier,
      division: snapshot.division,
      mmr: snapshot.mmr,
      mmrDelta: snapshot.mmrDelta,
      gamesToNextRank: snapshot.gamesToNextRank,
      progressToNextRank: snapshot.progressToNextRank,
      source: snapshot.source,
      status: snapshot.source === 'launch_log' ? 'experimental' : 'sincronizado',
      lastUpdatedAt: snapshot.capturedAt,
      notes: snapshot.source === 'launch_log'
        ? 'Leído desde Launch.log. Fuente experimental: confirmar contra el juego/Tracker si algo no cuadra.'
        : 'Snapshot de rango actualizado.',
    });
  }, store);
}
