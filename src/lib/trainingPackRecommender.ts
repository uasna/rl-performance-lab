import { trainingPacks } from '../data/trainingPacks';
import type {
  FrequentError,
  RocketLeagueDataStore,
  SkillAreaId,
  TrainingPack,
  TrainingPackRecommendation,
} from '../types/rocketLeague';


function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

const AREA_ALIASES: Record<SkillAreaId, string[]> = {
  movement: ['movement', 'recovery', 'recoveries', 'landing', 'aerial control', 'car control', 'speedflip', 'half flip', 'wave dash'],
  boost: ['boost', 'pads', 'pathing', 'overcollection', 'starving', 'boost usage'],
  offence: ['offence', 'offense', 'shooting', 'shot', 'pressure', 'passing', 'follow-up', 'rebound', 'redirect'],
  defence: ['defence', 'defense', 'shadow', 'saves', 'clear', 'backboard', 'back post', 'challenge'],
  rotation: ['rotation', 'spacing', 'third man', 'double commit', 'overcommit', 'recovery after attack'],
  positioning: ['positioning', 'distance', 'ball-side', 'offensive presence', 'defensive structure', 'adaptation'],
  mechanics: ['mechanics', 'double touch', 'aerial', 'dribble', 'redirect', 'backboard'],
  kickoffs: ['kickoff', 'speedflip', 'first touch', '50'],
  mental: ['mental', 'tilt', 'focus', 'decision'],
};

const PRIORITY_ORDER: SkillAreaId[] = ['positioning', 'rotation', 'movement', 'boost', 'defence', 'offence', 'mechanics', 'kickoffs', 'mental'];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/·|,.;:()[\]-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value).split(' ').filter((token) => token.length >= 3);
}

function activeError(errors: FrequentError[]): FrequentError | null {
  const candidates = errors.filter((error) => safeNumber(error.appearances) > 0 || safeNumber(error.impactScore) > 0);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const impactDelta = safeNumber(b.impactScore) - safeNumber(a.impactScore);
    if (impactDelta !== 0) return impactDelta;
    return safeNumber(b.appearances) - safeNumber(a.appearances);
  })[0] ?? null;
}

function weakestArea(store: RocketLeagueDataStore): SkillAreaId {
  const active = activeError(store.frequentErrors);
  if (active?.areaId) return active.areaId;

  const scored = store.skillAreas
    .filter((area) => ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'].includes(area.id))
    .filter((area) => safeNumber(area.currentScore) > 0)
    .sort((a, b) => {
      const delta = safeNumber(a.currentScore) - safeNumber(b.currentScore);
      if (delta !== 0) return delta;
      return PRIORITY_ORDER.indexOf(a.id) - PRIORITY_ORDER.indexOf(b.id);
    });

  return scored[0]?.id ?? store.profile.weakAreas[0] ?? 'positioning';
}

function rankFitScore(pack: TrainingPack, rankTier: string): number {
  const rank = normalize(rankTier);
  if (!rank || rank.includes('sin rango')) return 4;
  const combined = `${normalize(pack.rankMin)} ${normalize(pack.rankMax)}`;
  if (rank.includes('champion') && combined.includes('champion')) return 8;
  if (rank.includes('diamond') && combined.includes('diamond')) return 8;
  if (rank.includes('platinum') && (combined.includes('platinum') || combined.includes('diamond'))) return 8;
  if (rank.includes('gold') && (combined.includes('gold') || combined.includes('platinum'))) return 8;
  if (rank.includes('silver') && (combined.includes('silver') || combined.includes('gold'))) return 8;
  return 3;
}

function scorePack(pack: TrainingPack, areaId: SkillAreaId, error: FrequentError | null, rankTier: string): TrainingPackRecommendation {
  const reasons: string[] = [];
  const matchedTags: string[] = [];
  let score = 0;

  if (pack.areaIds.includes(areaId)) {
    score += 45;
    reasons.push(`Coincide con el área ${areaId}.`);
  }

  const aliasMatches = AREA_ALIASES[areaId].filter((alias) => pack.weaknessTags.some((tag) => normalize(tag).includes(normalize(alias))));
  if (aliasMatches.length) {
    score += Math.min(20, aliasMatches.length * 4);
    matchedTags.push(...aliasMatches.slice(0, 5));
  }

  if (error) {
    const errorTokens = new Set(tokenize(`${error.title} ${error.description} ${error.suggestedFix} ${error.suggestedDrill ?? ''}`));
    const packTokens = new Set(tokenize(`${pack.name} ${pack.objective} ${pack.weaknessTags.join(' ')}`));
    const overlap = [...errorTokens].filter((token) => packTokens.has(token));
    if (overlap.length) {
      score += Math.min(25, overlap.length * 6);
      matchedTags.push(...overlap.slice(0, 4));
      reasons.push(`Ataca el patrón ${error.title}.`);
    }
  }

  const rankScore = rankFitScore(pack, rankTier);
  score += rankScore;
  if (rankScore >= 8) reasons.push('Rango compatible con el perfil actual.');

  if (pack.sourceType === 'official_featured') score += 8;
  if (pack.sourceType === 'pro_featured') score += 6;
  if (pack.isInternalCustomTraining) score += 4;
  if (pack.difficulty === 'media') score += 4;
  if (pack.difficulty === 'baja' && ['positioning', 'defence', 'movement'].includes(areaId)) score += 2;

  return {
    pack,
    score,
    reasons: reasons.length ? reasons : ['Pack útil para convertir la debilidad en repetición medible.'],
    matchedTags: [...new Set(matchedTags)].slice(0, 6),
    priority: 'extra',
  };
}

export function recommendTrainingPacksForArea({
  store,
  areaId,
  maxResults = 3,
}: {
  store: RocketLeagueDataStore;
  areaId?: SkillAreaId;
  maxResults?: number;
}): TrainingPackRecommendation[] {
  const targetArea = areaId ?? weakestArea(store);
  const error = activeError(store.frequentErrors);
  const rankTier = store.profile.rank.tier;

  return trainingPacks
    .map((pack) => scorePack(pack, targetArea, error, rankTier))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((recommendation, index) => ({
      ...recommendation,
      priority: index === 0 ? 'principal' : index === 1 ? 'alternativo' : 'extra',
    }));
}

export function recommendTrainingPacksForStore(store: RocketLeagueDataStore, maxResults = 3): TrainingPackRecommendation[] {
  return recommendTrainingPacksForArea({ store, areaId: weakestArea(store), maxResults });
}

export function getPrimaryTrainingPack(store: RocketLeagueDataStore, areaId?: SkillAreaId): TrainingPackRecommendation | null {
  return recommendTrainingPacksForArea({ store, areaId, maxResults: 1 })[0] ?? null;
}

export function buildTrainingPackSearchUrl(areaId: SkillAreaId, errorTitle?: string): string {
  const terms = [areaId, errorTitle ?? '', 'Rocket League training pack'].filter(Boolean).join(' ');
  return `https://prejump.com/training-packs?search=${encodeURIComponent(terms)}`;
}

export function copyTrainingPackCode(code: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return Promise.reject(new Error('Clipboard no disponible'));
  return navigator.clipboard.writeText(code);
}
