import type { PlayerProfile, RocketLeagueMatch } from '../types/rocketLeague';

export const mockPlayerProfile: PlayerProfile = {
  id: 'player-rl-local',
  playerName: 'Cuenta RL',
  region: 'LATAM',
  primaryModes: ['2v2'],
  game: 'Rocket League',
  goal: 'Consistencia competitiva',
  mainMode: '2v2',
  rank: {
    id: 'rank-empty-local',
    capturedAt: '2026-06-08T00:00:00.000Z',
    playlist: '2v2',
    tier: 'Sin rango',
    division: 'Sin división',
    mmr: 0,
    mmrDelta: 0,
    gamesToNextRank: 0,
    progressToNextRank: 0,
    source: 'system',
  },
  strongAreas: [],
  weakAreas: [],
  mainFrequentErrorId: '',
  recommendedTrainingMinutes: 90,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
  source: 'system',
};

export const mockMatches: RocketLeagueMatch[] = [];
