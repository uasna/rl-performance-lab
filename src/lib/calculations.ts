import type {
  DailyProgress,
  DerivedRocketLeagueMetrics,
  FrequentError,
  ImprovementState,
  RankSnapshot,
  RocketLeagueDataStore,
  RocketLeagueMatch,
  SkillArea,
  SkillMetric,
  TrainingRecommendation,
  TrainingSession,
  TrendDirection,
} from '../types/rocketLeague';
import { getPrimaryTrainingPack } from './trainingPackRecommender';

export function safeNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, safeNumber(value)));
}

export function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + safeNumber(value), 0);
}

export function averageNumbers(values: number[]): number {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length === 0) return 0;
  return Math.round((sumNumbers(validValues) / validValues.length) * 10) / 10;
}

export function sortByDateAsc<T>(items: T[], getDate: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const leftDate = new Date(getDate(left)).getTime();
    const rightDate = new Date(getDate(right)).getTime();
    return leftDate - rightDate;
  });
}

export function calculateWinRate(matches: RocketLeagueMatch[]): number {
  const decidedMatches = matches.filter((match) => match.result === 'victoria' || match.result === 'derrota');
  if (decidedMatches.length === 0) return 0;
  const wins = decidedMatches.filter((match) => match.result === 'victoria').length;
  return Math.round((wins / decidedMatches.length) * 100);
}

export function calculateMatchRecord(matches: RocketLeagueMatch[]) {
  return {
    wins: matches.filter((match) => match.result === 'victoria').length,
    losses: matches.filter((match) => match.result === 'derrota').length,
    draws: matches.filter((match) => match.result === 'empate').length,
  };
}

export function calculateTotalTrainingMinutes(trainingSessions: TrainingSession[]): number {
  return sumNumbers(trainingSessions.map((session) => session.durationMinutes));
}

export function calculateMmrDelta(rankHistory: RankSnapshot[]): number {
  const sortedHistory = sortByDateAsc(rankHistory, (snapshot) => snapshot.capturedAt);
  const first = sortedHistory[0];
  const latest = sortedHistory.at(-1);
  if (!first || !latest) return 0;
  return safeNumber(latest.mmr) - safeNumber(first.mmr);
}

export function calculateMmrTrend(rankHistory: RankSnapshot[]): TrendDirection {
  const sortedHistory = sortByDateAsc(rankHistory, (snapshot) => snapshot.capturedAt);
  if (sortedHistory.length < 2) return 'stable';

  const lastThree = sortedHistory.slice(-3);
  const delta = safeNumber(lastThree.at(-1)?.mmr) - safeNumber(lastThree[0]?.mmr);
  if (delta >= 8) return 'up';
  if (delta <= -8) return 'down';
  return 'stable';
}

export function calculateSkillAverage(skillAreas: SkillArea[]): number {
  const scoredAreas = skillAreas.filter((area) => safeNumber(area.currentScore) > 0);
  if (scoredAreas.length === 0) return 0;
  return averageNumbers(scoredAreas.map((area) => area.currentScore));
}

export function getStrongestArea(skillAreas: SkillArea[]): SkillArea | null {
  const scoredAreas = skillAreas.filter((area) => safeNumber(area.currentScore) > 0);
  if (scoredAreas.length === 0) return null;
  return [...scoredAreas].sort((a, b) => safeNumber(b.currentScore) - safeNumber(a.currentScore))[0] ?? null;
}

export function getWeakestArea(skillAreas: SkillArea[]): SkillArea | null {
  const scoredAreas = skillAreas.filter((area) => safeNumber(area.currentScore) > 0);
  if (scoredAreas.length === 0) return null;
  return [...scoredAreas].sort((a, b) => safeNumber(a.currentScore) - safeNumber(b.currentScore))[0] ?? null;
}

export function getMostFrequentError(errors: FrequentError[]): FrequentError | null {
  const activeErrors = errors.filter((error) => safeNumber(error.appearances) > 0 || safeNumber(error.impactScore) > 0);
  if (activeErrors.length === 0) return null;
  return [...activeErrors].sort((a, b) => {
    const appearancesDelta = safeNumber(b.appearances) - safeNumber(a.appearances);
    if (appearancesDelta !== 0) return appearancesDelta;
    return safeNumber(b.impactScore) - safeNumber(a.impactScore);
  })[0] ?? null;
}

export function calculateAverageMetric(metrics: SkillMetric[], metricLabel: string): number {
  return averageNumbers(
    metrics
      .filter((metric) => metric.label.toLowerCase() === metricLabel.toLowerCase())
      .map((metric) => metric.value),
  );
}

export function calculateProgressTotals(progress: DailyProgress[]) {
  return {
    playedMatches: sumNumbers(progress.map((day) => day.playedMatches)),
    wins: sumNumbers(progress.map((day) => day.wins)),
    losses: sumNumbers(progress.map((day) => day.losses)),
    draws: sumNumbers(progress.map((day) => day.draws)),
    trainingMinutes: sumNumbers(progress.map((day) => day.trainingMinutes)),
    mmrDelta: sumNumbers(progress.map((day) => day.mmrDelta)),
    completedBlocks: sumNumbers(progress.map((day) => day.completedBlocks)),
    totalBlocks: sumNumbers(progress.map((day) => day.totalBlocks)),
  };
}

export function calculateWeeklyProgressTotals(progress: DailyProgress[]) {
  return calculateProgressTotals(progress);
}

export function calculateConsistency(progress: DailyProgress[]): number {
  if (progress.length === 0) return 0;

  const activeDays = progress.filter((day) => safeNumber(day.trainingMinutes) > 0 || safeNumber(day.playedMatches) > 0).length;
  const activeDayScore = (activeDays / progress.length) * 100;
  const totalBlocks = sumNumbers(progress.map((day) => day.totalBlocks));
  const completedBlocks = sumNumbers(progress.map((day) => day.completedBlocks));
  const completionScore = totalBlocks > 0 ? (completedBlocks / totalBlocks) * 100 : activeDayScore;

  return Math.round(clamp(activeDayScore * 0.35 + completionScore * 0.65));
}

export function getProgressForLastDays(progress: DailyProgress[], days: number): DailyProgress[] {
  if (progress.length === 0) return [];
  const sortedProgress = sortByDateAsc(progress, (day) => day.date);
  const latestTime = new Date(sortedProgress.at(-1)?.date ?? '').getTime();
  if (Number.isNaN(latestTime)) return sortedProgress.slice(-days);

  const firstAllowedTime = latestTime - (days - 1) * 24 * 60 * 60 * 1000;
  return sortedProgress.filter((day) => {
    const time = new Date(day.date).getTime();
    return !Number.isNaN(time) && time >= firstAllowedTime && time <= latestTime;
  });
}

export function calculateImprovementState(rankHistory: RankSnapshot[], progress: DailyProgress[]): ImprovementState {
  const recentProgress = getProgressForLastDays(progress, 7);
  const mmrDelta = calculateMmrDelta(rankHistory.slice(-7));
  const consistency = calculateConsistency(recentProgress);
  const winRate = calculateWinRateFromProgress(recentProgress);

  if (mmrDelta >= 12 || (consistency >= 75 && winRate >= 55)) return 'improving';
  if (mmrDelta <= -12 || (consistency < 45 && winRate < 45)) return 'declining';
  return 'stable';
}

export function calculateWinRateFromProgress(progress: DailyProgress[]): number {
  const wins = sumNumbers(progress.map((day) => day.wins));
  const losses = sumNumbers(progress.map((day) => day.losses));
  const decidedMatches = wins + losses;
  if (decidedMatches === 0) return 0;
  return Math.round((wins / decidedMatches) * 100);
}

export function getTrainingRecommendation(store: RocketLeagueDataStore): TrainingRecommendation | null {
  const mostFrequentError = getMostFrequentError(store.frequentErrors);
  const weakestArea = getWeakestArea(store.skillAreas);
  const profileWeakArea = store.profile.weakAreas[0];
  const targetAreaId = mostFrequentError?.areaId ?? weakestArea?.id ?? profileWeakArea;
  const targetArea = store.skillAreas.find((area) => area.id === targetAreaId) ?? null;

  if (!targetArea) return null;

  const suggestedMinutes = store.profile.recommendedTrainingMinutes || store.settings.preferredTrainingMinutes || 0;

  const primaryPack = getPrimaryTrainingPack(store, targetArea.id);

  return {
    areaId: targetArea.id,
    title: `Enfocar ${targetArea.name}`,
    reason: mostFrequentError
      ? `${mostFrequentError.title}: ${mostFrequentError.suggestedFix}`
      : primaryPack
        ? `Pack sugerido para convertir ${targetArea.name} en repetición medible: ${primaryPack.pack.name}.`
        : 'Primer foco recomendado antes de acumular datos reales. Registrá partidas para validar si esta debilidad se mantiene.',
    suggestedMinutes,
    priority: mostFrequentError?.severity ?? 'media',
    trainingPackCode: primaryPack?.pack.code ?? 'Rutina interna sugerida',
    trainingPackName: primaryPack?.pack.name,
    trainingPackCreator: primaryPack?.pack.creator,
  };
}

export function calculateDerivedMetrics(store: RocketLeagueDataStore): DerivedRocketLeagueMetrics {
  const last7DaysProgress = getProgressForLastDays(store.dailyProgress, 7);
  const last30DaysProgress = getProgressForLastDays([...store.dailyProgress, ...store.monthlyProgress], 30);

  return {
    record: calculateMatchRecord(store.matches),
    winRate: calculateWinRate(store.matches),
    mmrDelta: calculateMmrDelta(store.rankHistory),
    mmrTrend: calculateMmrTrend(store.rankHistory),
    skillAverage: calculateSkillAverage(store.skillAreas),
    strongestArea: getStrongestArea(store.skillAreas),
    weakestArea: getWeakestArea(store.skillAreas),
    mostFrequentError: getMostFrequentError(store.frequentErrors),
    trainingRecommendation: getTrainingRecommendation(store),
    weeklyConsistency: calculateConsistency(last7DaysProgress),
    last7DaysProgress,
    last30DaysProgress,
    improvementState: calculateImprovementState(store.rankHistory, store.dailyProgress),
    totalTrainingMinutes: calculateTotalTrainingMinutes(store.trainingSessions),
    weeklyTotals: calculateProgressTotals(last7DaysProgress),
    monthlyTotals: calculateProgressTotals(last30DaysProgress),
  };
}

export function getLatestItem<T>(items: T[]): T | null {
  return items[0] ?? null;
}
