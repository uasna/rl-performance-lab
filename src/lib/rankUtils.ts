import type { RankSnapshot } from '../types/rocketLeague';

export function formatRankLabel(rank: RankSnapshot): string {
  return `${rank.tier} · ${rank.division}`;
}

export function getRankAccentClass(rank: RankSnapshot): string {
  if (rank.tier.toLowerCase().includes('champion')) return 'border-violet-300/25 bg-violet-300/10 text-violet-100';
  if (rank.tier.toLowerCase().includes('diamond')) return 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100';
  return 'border-white/10 bg-white/[0.04] text-slate-200';
}

export function getGamesToNextRankLabel(rank: RankSnapshot): string {
  return `${rank.gamesToNextRank} partidas al siguiente rango`;
}
