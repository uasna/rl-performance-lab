import type {
  FrequentError,
  FrequentErrorSeverity,
  RocketLeagueDataStore,
  RocketLeagueMatch,
  SkillArea,
  SkillAreaId,
  SkillMetric,
  TrendDirection,
} from '../types/rocketLeague';
import { clamp, safeNumber } from './calculations';

export type DiagnosticConfidence = 'alta' | 'media' | 'baja';

export interface MatchDiagnosticResult {
  matchId: string;
  primaryAreaId: SkillAreaId;
  mainErrorId: string;
  mainErrorTitle: string;
  severity: FrequentErrorSeverity;
  confidence: DiagnosticConfidence;
  summary: string;
  lesson: string;
  nextTrainingAction: string;
  recommendedFocus: string;
  scores: Partial<Record<SkillAreaId, number>>;
  signals: string[];
}

export interface SessionDiagnosticResult {
  hasData: boolean;
  analysedMatches: number;
  importedMatches: number;
  criticalAreaId: SkillAreaId;
  criticalAreaName: string;
  strongestAreaId: SkillAreaId | null;
  strongestAreaName: string;
  mainErrorId: string;
  mainErrorTitle: string;
  severity: FrequentErrorSeverity;
  summary: string;
  nextAction: string;
  confidence: DiagnosticConfidence;
  signals: string[];
}

const AREA_FALLBACK_LABELS: Record<SkillAreaId, string> = {
  movement: 'Movement',
  boost: 'Boost',
  offence: 'Offence',
  defence: 'Defence',
  rotation: 'Rotation',
  positioning: 'Positioning',
  mechanics: 'Mechanics',
  kickoffs: 'Kickoffs',
  mental: 'Mental',
};

function areaName(areaId: SkillAreaId, areas?: SkillArea[]) {
  return areas?.find((area) => area.id === areaId)?.name ?? AREA_FALLBACK_LABELS[areaId] ?? areaId;
}

function opponentGoals(match: RocketLeagueMatch): number {
  if (match.teamColor === 'orange') return safeNumber(match.score.blue);
  if (match.teamColor === 'blue') return safeNumber(match.score.orange);
  return Math.min(safeNumber(match.score.blue), safeNumber(match.score.orange));
}

function ownGoals(match: RocketLeagueMatch): number {
  if (match.teamColor === 'orange') return safeNumber(match.score.orange);
  if (match.teamColor === 'blue') return safeNumber(match.score.blue);
  return Math.max(safeNumber(match.score.blue), safeNumber(match.score.orange));
}

function accuracy(match: RocketLeagueMatch): number {
  const shots = safeNumber(match.playerStats.shots);
  if (shots <= 0) return 0;
  return Math.round((safeNumber(match.playerStats.goals) / shots) * 100);
}

function trendFromValues(values: number[]): TrendDirection {
  if (values.length < 2) return 'stable';
  const first = values[0] ?? 0;
  const latest = values.at(-1) ?? 0;
  if (latest - first >= 8) return 'up';
  if (latest - first <= -8) return 'down';
  return 'stable';
}

function scoreAreaFromMatch(match: RocketLeagueMatch): Partial<Record<SkillAreaId, number>> {
  const goalsAgainst = opponentGoals(match);
  const shots = safeNumber(match.playerStats.shots);
  const assists = safeNumber(match.playerStats.assists);
  const saves = safeNumber(match.playerStats.saves);
  const shotAccuracy = accuracy(match);
  const won = match.result === 'victoria';
  const cleanSheet = goalsAgainst === 0 && match.teamColor !== 'neutral';

  const offence = shots > 0
    ? clamp(Math.round(shotAccuracy * 0.62 + Math.min(shots * 5, 22) + Math.min(assists * 7, 14) + (won ? 6 : 0)), 0, 100)
    : 0;

  const defence = clamp(Math.round(54 + Math.min(saves * 14, 32) + (cleanSheet ? 24 : 0) - goalsAgainst * 11), 0, 100);
  const positioning = clamp(Math.round(62 + (cleanSheet ? 23 : 0) + (won ? 6 : 0) - goalsAgainst * 12 - safeNumber(match.performance.overcommitCount) * 14), 0, 100);
  const rotation = clamp(Math.round(58 + (won ? 12 : 0) + (cleanSheet ? 15 : 0) - goalsAgainst * 9 - safeNumber(match.performance.defensiveErrors) * 4), 0, 100);

  return {
    offence,
    defence,
    positioning,
    rotation,
    // Movement and boost stay empty until the parser exposes frame/boost telemetry.
  };
}

function pickCriticalFromScores(scores: Partial<Record<SkillAreaId, number>>): SkillAreaId {
  const entries = Object.entries(scores).filter(([, value]) => safeNumber(value) > 0) as Array<[SkillAreaId, number]>;
  if (!entries.length) return 'positioning';
  return [...entries].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'positioning';
}

export function diagnoseMatch(match: RocketLeagueMatch): MatchDiagnosticResult {
  const goalsAgainst = opponentGoals(match);
  const goalsFor = ownGoals(match);
  const shots = safeNumber(match.playerStats.shots);
  const goals = safeNumber(match.playerStats.goals);
  const assists = safeNumber(match.playerStats.assists);
  const saves = safeNumber(match.playerStats.saves);
  const score = safeNumber(match.playerStats.score);
  const shotAccuracy = accuracy(match);
  const scores = scoreAreaFromMatch(match);
  const signals: string[] = [];
  let primaryAreaId = pickCriticalFromScores(scores);
  let mainErrorId = '';
  let mainErrorTitle = 'Sin error crítico detectado';
  let severity: FrequentErrorSeverity = 'baja';
  let summary = 'Replay importado: todavía faltan más partidas para detectar un patrón estable.';
  let lesson = 'Usá esta partida como punto de referencia y seguí importando replays para que el diagnóstico sea por tendencia.';
  let nextTrainingAction = 'Registrar al menos 3 replays más antes de tomar decisiones fuertes.';
  let recommendedFocus = 'Replay review breve y registro de observaciones.';

  if (shots > 0) signals.push(`Precisión estimada: ${shotAccuracy}% (${goals}/${shots}).`);
  if (goalsAgainst === 0 && match.teamColor !== 'neutral') signals.push('Partida con arco en cero detectada.');
  if (score > 0) signals.push(`Score personal leído del replay: ${score}.`);

  if (match.result === 'derrota' && goalsAgainst >= 3) {
    primaryAreaId = 'defence';
    mainErrorId = 'error-bad-challenge';
    mainErrorTitle = 'Goles concedidos bajo presión';
    severity = goalsAgainst >= 5 ? 'critica' : 'alta';
    summary = `Derrota con ${goalsAgainst} goles en contra. Prioridad: revisar decisiones defensivas antes de cada gol recibido.`;
    lesson = 'El replay apunta a defensa/challenge timing. Hay que encontrar el primer mal posicionamiento antes del gol, no solo el último toque.';
    nextTrainingAction = '15 min de replay review de goles concedidos + 10 min de 1v1 con objetivo de no saltar temprano.';
    recommendedFocus = 'Defence: challenge timing, shadow y back post.';
  } else if (shots >= 3 && goals === 0) {
    primaryAreaId = 'offence';
    mainErrorId = 'error-missed-open-net';
    mainErrorTitle = 'Baja conversión de tiros';
    severity = 'media';
    summary = `Se detectaron ${shots} tiros sin gol personal. Prioridad: calidad de tiro y selección de disparo.`;
    lesson = 'El problema no es generar ocasiones, sino convertirlas con colocación y timing.';
    nextTrainingAction = '10 min de tiros internos simples, priorizando colocación antes que potencia.';
    recommendedFocus = 'Offence: shooting accuracy y shot selection.';
  } else if (match.result === 'derrota' && goalsAgainst > 0 && saves === 0) {
    primaryAreaId = 'positioning';
    mainErrorId = 'error-poor-shadow';
    mainErrorTitle = 'Baja intervención defensiva';
    severity = 'alta';
    summary = 'Derrota con goles en contra y sin saves personales. Revisar distancia al juego y entrada defensiva.';
    lesson = 'Si no aparecen saves, puede haber problema de anticipación, back post o distancia de soporte.';
    nextTrainingAction = 'Replay review: pausar 5 segundos antes de cada gol rival y anotar ubicación propia.';
    recommendedFocus = 'Positioning: distancia a la jugada y estructura defensiva.';
  } else if (match.result === 'victoria' && goalsAgainst === 0) {
    primaryAreaId = 'rotation';
    mainErrorId = '';
    mainErrorTitle = 'Sin error crítico detectado';
    severity = 'baja';
    summary = `Victoria limpia ${goalsFor}-${goalsAgainst}. Buen replay para estudiar qué decisiones mantuvieron presión y cobertura.`;
    lesson = 'No se fuerza un error: esta partida debe usarse como referencia positiva de presión, rotación y cierre defensivo.';
    nextTrainingAction = 'Replay review de 8 minutos: anotar 3 decisiones que generaron goles o mantuvieron el arco en cero.';
    recommendedFocus = 'Mantener rotación y repetir patrones positivos.';
  } else if (match.result === 'victoria') {
    primaryAreaId = goals >= 2 || assists >= 1 ? 'offence' : 'rotation';
    mainErrorId = '';
    mainErrorTitle = 'Sin error crítico detectado';
    severity = 'baja';
    summary = `Victoria ${goalsFor}-${goalsAgainst}. Revisar cómo se generó la ventaja y dónde se pudo conceder menos espacio.`;
    lesson = 'La victoria también sirve para aislar patrones repetibles, no solo errores.';
    nextTrainingAction = 'Replay review corto: encontrar 2 buenas decisiones ofensivas y 1 riesgo innecesario.';
    recommendedFocus = 'Consolidar presión sin perder estructura.';
  }

  return {
    matchId: match.id,
    primaryAreaId,
    mainErrorId,
    mainErrorTitle,
    severity,
    confidence: match.source === 'replay_parser' ? 'media' : 'baja',
    summary,
    lesson,
    nextTrainingAction,
    recommendedFocus,
    scores,
    signals,
  };
}

function areaAveragesFromMatches(matches: RocketLeagueMatch[]) {
  const buckets = new Map<SkillAreaId, number[]>();

  matches.forEach((match) => {
    const diagnosisScores = diagnoseMatch(match).scores;
    Object.entries(diagnosisScores).forEach(([areaId, value]) => {
      const score = safeNumber(value);
      if (score <= 0) return;
      const key = areaId as SkillAreaId;
      buckets.set(key, [...(buckets.get(key) ?? []), score]);
    });
  });

  const averages = new Map<SkillAreaId, number>();
  buckets.forEach((values, areaId) => {
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    averages.set(areaId, Math.round(average));
  });

  return averages;
}

function nextTrendForArea(areaId: SkillAreaId, matches: RocketLeagueMatch[]): TrendDirection {
  const values = matches
    .slice(0, 5)
    .reverse()
    .map((match) => diagnoseMatch(match).scores[areaId])
    .filter((value): value is number => safeNumber(value) > 0);

  return trendFromValues(values);
}

function updateSkillAreasFromMatches(skillAreas: SkillArea[], matches: RocketLeagueMatch[]): SkillArea[] {
  const recentMatches = matches.slice(0, 10);
  const averages = areaAveragesFromMatches(recentMatches);
  const scoredAreaIds = [...averages.entries()].sort((a, b) => a[1] - b[1]);
  const weakestIds = new Set(scoredAreaIds.slice(0, 2).map(([areaId]) => areaId));
  const strongestIds = new Set([...scoredAreaIds].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([areaId]) => areaId));

  return skillAreas.map((area) => {
    const average = averages.get(area.id);
    if (!average) {
      return {
        ...area,
        isStrongArea: false,
        isWeakArea: false,
        trend: 'stable',
      };
    }

    return {
      ...area,
      currentScore: average,
      targetScore: Math.min(100, Math.max(area.targetScore, average + 10)),
      trend: nextTrendForArea(area.id, recentMatches),
      recommendedMinutes: weakestIds.has(area.id) ? 25 : area.recommendedMinutes,
      isWeakArea: weakestIds.has(area.id),
      isStrongArea: strongestIds.has(area.id),
    };
  });
}

function updateSkillMetricsFromAreas(metrics: SkillMetric[], areas: SkillArea[]): SkillMetric[] {
  return metrics.map((metric) => {
    const area = areas.find((item) => item.id === metric.areaId);
    if (!area) return metric;
    if (metric.label === 'Score actual') {
      return { ...metric, value: area.currentScore, target: area.targetScore, trend: area.trend, source: 'replay_parser' };
    }
    if (metric.label === 'Tendencia 5 juegos') {
      const trendValue = area.trend === 'up' ? 1 : area.trend === 'down' ? -1 : 0;
      return { ...metric, value: trendValue, target: 1, trend: area.trend, source: 'replay_parser' };
    }
    return metric;
  });
}

function updateErrorsFromMatches(errors: FrequentError[], matches: RocketLeagueMatch[]): FrequentError[] {
  const diagnoses = matches.map(diagnoseMatch).filter((diagnosis) => diagnosis.mainErrorId);

  return errors.map((error) => {
    const matchesForError = diagnoses.filter((diagnosis) => diagnosis.mainErrorId === error.id);
    if (!matchesForError.length) {
      const hasHistory = error.appearances > 0;
      return {
        ...error,
        status: hasHistory ? 'bajando' : error.status,
      };
    }

    const latestMatch = matches.find((match) => matchesForError.some((diagnosis) => diagnosis.matchId === match.id));
    const appearances = matchesForError.length;
    return {
      ...error,
      appearances,
      lastSeenAt: latestMatch?.playedAt ?? new Date().toISOString(),
      impactScore: clamp(appearances * 18 + (matchesForError.some((diagnosis) => diagnosis.severity === 'alta' || diagnosis.severity === 'critica') ? 28 : 10), 0, 100),
      severity: matchesForError.some((diagnosis) => diagnosis.severity === 'critica') ? 'critica' : matchesForError.some((diagnosis) => diagnosis.severity === 'alta') ? 'alta' : error.severity,
      status: 'activo',
    };
  });
}

function buildDailyProgressFromMatches(store: RocketLeagueDataStore): RocketLeagueDataStore['dailyProgress'] {
  const byDate = new Map<string, RocketLeagueDataStore['dailyProgress'][number]>();

  store.dailyProgress.forEach((day) => byDate.set(day.date, day));

  store.matches.forEach((match) => {
    const date = match.playedAt.slice(0, 10);
    const existing = byDate.get(date) ?? {
      id: `progress-${date}`,
      date,
      playedMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      trainingMinutes: 0,
      mmrStart: safeNumber(match.mmrBefore),
      mmrEnd: safeNumber(match.mmrAfter),
      mmrDelta: safeNumber(match.rankSnapshot.mmrDelta),
      completedBlocks: 0,
      totalBlocks: 0,
      focusAreaId: match.recommendedFocusAreaId ?? 'positioning',
      summary: 'Progreso generado desde replays importados.',
      source: 'replay_parser',
    };

    byDate.set(date, {
      ...existing,
      playedMatches: existing.playedMatches + 1,
      wins: existing.wins + (match.result === 'victoria' ? 1 : 0),
      losses: existing.losses + (match.result === 'derrota' ? 1 : 0),
      draws: existing.draws + (match.result === 'empate' ? 1 : 0),
      focusAreaId: match.recommendedFocusAreaId ?? existing.focusAreaId,
      summary: 'Progreso actualizado automáticamente desde partidas importadas.',
      source: existing.source === 'manual' ? 'manual' : 'replay_parser',
    });
  });

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function decorateMatches(matches: RocketLeagueMatch[]): RocketLeagueMatch[] {
  return matches.map((match) => {
    if (match.source !== 'replay_parser') return match;
    const diagnosis = diagnoseMatch(match);
    return {
      ...match,
      personalMetrics: {
        movement: match.personalMetrics?.movement ?? 0,
        boost: match.personalMetrics?.boost ?? 0,
        offence: diagnosis.scores.offence ?? match.personalMetrics?.offence ?? 0,
        defence: diagnosis.scores.defence ?? match.personalMetrics?.defence ?? 0,
        rotation: diagnosis.scores.rotation ?? match.personalMetrics?.rotation ?? 0,
        positioning: diagnosis.scores.positioning ?? match.personalMetrics?.positioning ?? 0,
      },
      mainErrorId: diagnosis.mainErrorId,
      mainErrorTitle: diagnosis.mainErrorTitle,
      affectedAreaId: diagnosis.primaryAreaId,
      recommendedFocusAreaId: diagnosis.primaryAreaId,
      recommendedFocus: diagnosis.recommendedFocus,
      quickObservation: diagnosis.summary,
      lesson: diagnosis.lesson,
      nextTrainingAction: diagnosis.nextTrainingAction,
      tags: Array.from(new Set([...match.tags, 'diagnosticado'])),
    };
  });
}

export function applyDiagnosticsToStore(store: RocketLeagueDataStore): RocketLeagueDataStore {
  const matches = decorateMatches(store.matches);
  const skillAreas = updateSkillAreasFromMatches(store.skillAreas, matches);
  const skillMetrics = updateSkillMetricsFromAreas(store.skillMetrics, skillAreas);
  const frequentErrors = updateErrorsFromMatches(store.frequentErrors, matches);
  const scoredAreas = skillAreas.filter((area) => area.currentScore > 0);
  const weakAreas = scoredAreas.filter((area) => area.isWeakArea).map((area) => area.id);
  const strongAreas = scoredAreas.filter((area) => area.isStrongArea).map((area) => area.id);
  const dailyProgress = buildDailyProgressFromMatches({ ...store, matches });
  const mainFrequentErrorId = frequentErrors.find((error) => error.appearances > 0)?.id ?? store.profile.mainFrequentErrorId;

  return {
    ...store,
    matches,
    skillAreas,
    skillMetrics,
    frequentErrors,
    dailyProgress,
    profile: {
      ...store.profile,
      weakAreas: weakAreas.length ? weakAreas : store.profile.weakAreas,
      strongAreas: strongAreas.length ? strongAreas : store.profile.strongAreas,
      mainFrequentErrorId,
    },
  };
}

export function buildSessionDiagnosis(store: RocketLeagueDataStore): SessionDiagnosticResult {
  const recentMatches = store.matches.slice(0, 10);
  const importedMatches = recentMatches.filter((match) => match.source === 'replay_parser').length;

  if (!recentMatches.length) {
    return {
      hasData: false,
      analysedMatches: 0,
      importedMatches: 0,
      criticalAreaId: 'positioning',
      criticalAreaName: areaName('positioning', store.skillAreas),
      strongestAreaId: null,
      strongestAreaName: 'Sin datos',
      mainErrorId: '',
      mainErrorTitle: 'Sin datos suficientes',
      severity: 'baja',
      summary: 'Importá al menos una partida para activar el diagnóstico real.',
      nextAction: 'Procesar un replay y crear una partida automática.',
      confidence: 'baja',
      signals: [],
    };
  }

  const averages = areaAveragesFromMatches(recentMatches);
  const weakestAreaId = [...averages.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'positioning';
  const strongestAreaId = [...averages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const activeError = store.frequentErrors.filter((error) => error.appearances > 0).sort((a, b) => b.impactScore - a.impactScore)[0] ?? null;
  const wins = recentMatches.filter((match) => match.result === 'victoria').length;
  const losses = recentMatches.filter((match) => match.result === 'derrota').length;
  const goalsFor = recentMatches.reduce((total, match) => total + ownGoals(match), 0);
  const goalsAgainst = recentMatches.reduce((total, match) => total + opponentGoals(match), 0);

  const summary = activeError
    ? `Patrón principal detectado: ${activeError.title}. Aparece ${activeError.appearances} vez/veces en las últimas partidas.`
    : `Sin error crítico repetido. Balance reciente: ${wins}V/${losses}D, goles ${goalsFor}-${goalsAgainst}.`;

  const nextAction = activeError
    ? activeError.suggestedDrill ?? 'Replay review manual de las jugadas vinculadas al error principal.'
    : `Entrenamiento sugerido: 10 min de replay review positivo + 15 min enfocado en ${areaName(weakestAreaId, store.skillAreas)}.`;

  return {
    hasData: true,
    analysedMatches: recentMatches.length,
    importedMatches,
    criticalAreaId: activeError?.areaId ?? weakestAreaId,
    criticalAreaName: areaName(activeError?.areaId ?? weakestAreaId, store.skillAreas),
    strongestAreaId,
    strongestAreaName: strongestAreaId ? areaName(strongestAreaId, store.skillAreas) : 'Sin datos',
    mainErrorId: activeError?.id ?? '',
    mainErrorTitle: activeError?.title ?? 'Sin error crítico repetido',
    severity: activeError?.severity ?? 'baja',
    summary,
    nextAction,
    confidence: importedMatches >= 3 ? 'alta' : importedMatches >= 1 ? 'media' : 'baja',
    signals: [
      `${recentMatches.length} partidas evaluadas`,
      `${importedMatches} importadas desde replay`,
      `Goles: ${goalsFor}-${goalsAgainst}`,
    ],
  };
}
