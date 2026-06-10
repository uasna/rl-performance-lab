import type {
  FrequentError,
  FrequentErrorSeverity,
  RocketLeagueDataStore,
  RocketLeagueMatch,
  SkillArea,
  SkillAreaId,
  TrainingBlock,
  TrainingPackRecommendation,
} from '../types/rocketLeague';
import { averageNumbers, calculateWinRate, safeNumber } from './calculations';
import { recommendTrainingPacksForArea } from './trainingPackRecommender';

export type CoachConfidence = 'alta' | 'media' | 'baja';
export type CoachReadiness = 'sin_datos' | 'muestra_inicial' | 'tendencia_util' | 'tendencia_confiable';

export interface SessionCoachPlan {
  hasData: boolean;
  readiness: CoachReadiness;
  focusAreaId: SkillAreaId;
  focusAreaName: string;
  secondaryAreaId: SkillAreaId | null;
  secondaryAreaName: string;
  mainErrorId: string;
  mainErrorTitle: string;
  severity: FrequentErrorSeverity;
  confidence: CoachConfidence;
  analysedMatches: number;
  importedMatches: number;
  sessionWindowLabel: string;
  winRate: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  averageScore: number;
  summary: string;
  whyThisFocus: string;
  nextMatchObjective: string;
  rankedRule: string;
  reviewQuestion: string;
  successCriteria: string[];
  blocks: TrainingBlock[];
  trainingPacks: TrainingPackRecommendation[];
  tomorrowRoutineTitle: string;
  tomorrowRoutineSummary: string;
  signals: string[];
}

const AREA_LABELS: Record<SkillAreaId, string> = {
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

const PRIORITY_ORDER: SkillAreaId[] = [
  'positioning',
  'rotation',
  'movement',
  'boost',
  'defence',
  'offence',
  'mechanics',
  'kickoffs',
  'mental',
];

function areaName(areaId: SkillAreaId, areas: SkillArea[]): string {
  return areas.find((area) => area.id === areaId)?.name ?? AREA_LABELS[areaId] ?? areaId;
}

function ownGoals(match: RocketLeagueMatch): number {
  if (match.teamColor === 'orange') return safeNumber(match.score.orange);
  if (match.teamColor === 'blue') return safeNumber(match.score.blue);
  return Math.max(safeNumber(match.score.blue), safeNumber(match.score.orange));
}

function opponentGoals(match: RocketLeagueMatch): number {
  if (match.teamColor === 'orange') return safeNumber(match.score.blue);
  if (match.teamColor === 'blue') return safeNumber(match.score.orange);
  return Math.min(safeNumber(match.score.blue), safeNumber(match.score.orange));
}

function matchScore(match: RocketLeagueMatch): number {
  return safeNumber(match.playerStats.score);
}

function confidenceFromMatches(importedMatches: number, totalMatches: number): CoachConfidence {
  if (importedMatches >= 5 || totalMatches >= 8) return 'alta';
  if (importedMatches >= 2 || totalMatches >= 3) return 'media';
  return 'baja';
}

function readinessFromMatches(importedMatches: number, totalMatches: number): CoachReadiness {
  if (totalMatches <= 0) return 'sin_datos';
  if (importedMatches >= 5 || totalMatches >= 8) return 'tendencia_confiable';
  if (importedMatches >= 2 || totalMatches >= 3) return 'tendencia_util';
  return 'muestra_inicial';
}

function readinessLabel(readiness: CoachReadiness): string {
  if (readiness === 'tendencia_confiable') return 'Tendencia confiable';
  if (readiness === 'tendencia_util') return 'Tendencia útil';
  if (readiness === 'muestra_inicial') return 'Muestra inicial';
  return 'Sin datos';
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

function areaAverageFromMatches(matches: RocketLeagueMatch[], areaId: SkillAreaId): number {
  const values = matches
    .map((match) => {
      if (!match.personalMetrics) return 0;
      if (areaId === 'movement') return match.personalMetrics.movement;
      if (areaId === 'boost') return match.personalMetrics.boost;
      if (areaId === 'offence') return match.personalMetrics.offence;
      if (areaId === 'defence') return match.personalMetrics.defence;
      if (areaId === 'rotation') return match.personalMetrics.rotation;
      if (areaId === 'positioning') return match.personalMetrics.positioning;
      return 0;
    })
    .filter((value) => Number.isFinite(value) && Number(value) > 0);
  return values.length ? averageNumbers(values) : 0;
}

function weakestAreaFromMatches(store: RocketLeagueDataStore, recentMatches: RocketLeagueMatch[]): SkillAreaId {
  const active = activeError(store.frequentErrors);
  if (active?.areaId) return active.areaId;

  const scored = store.skillAreas
    .filter((area) => ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'].includes(area.id))
    .map((area) => ({
      areaId: area.id,
      score: safeNumber(area.currentScore) || areaAverageFromMatches(recentMatches, area.id),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      return PRIORITY_ORDER.indexOf(left.areaId) - PRIORITY_ORDER.indexOf(right.areaId);
    });

  if (scored[0]) return scored[0].areaId;
  return store.profile.weakAreas.find((areaId) => PRIORITY_ORDER.includes(areaId)) ?? 'positioning';
}

function secondaryArea(store: RocketLeagueDataStore, recentMatches: RocketLeagueMatch[], primary: SkillAreaId): SkillAreaId | null {
  const scored = store.skillAreas
    .filter((area) => area.id !== primary && ['movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'].includes(area.id))
    .map((area) => ({ areaId: area.id, score: safeNumber(area.currentScore) || areaAverageFromMatches(recentMatches, area.id) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => left.score - right.score);
  return scored[0]?.areaId ?? null;
}

function makeBlock(
  id: string,
  areaId: SkillAreaId,
  title: string,
  description: string,
  durationMinutes: number,
  objective: string,
  blockType: TrainingBlock['blockType'],
): TrainingBlock {
  return {
    id,
    areaId,
    title,
    description,
    durationMinutes,
    targetRepetitions: 0,
    completedRepetitions: 0,
    status: 'pendiente',
    trainingPackCode: 'Rutina interna',
    source: 'system',
    blockType,
    objective,
  };
}

function buildBlocksForFocus(focusAreaId: SkillAreaId, focusAreaName: string, mainErrorTitle: string, primaryPack?: TrainingPackRecommendation | null): TrainingBlock[] {
  const safeError = mainErrorTitle && mainErrorTitle !== 'Sin error crítico repetido' ? mainErrorTitle : focusAreaName;

  const baseReview = makeBlock(
    'coach-replay-review',
    focusAreaId,
    'Replay review dirigido',
    'Revisar una repetición reciente y pausar en cada decisión relevante del foco actual.',
    15,
    `Encontrar 3 momentos donde ${focusAreaName} decidió la jugada. Anotar una regla concreta para la siguiente partida.`,
    'replay_review',
  );

  const rest = makeBlock(
    'coach-rest',
    'mental',
    'Descanso corto',
    'Pausa breve para soltar manos, revisar postura y entrar sin tilt al bloque competitivo.',
    5,
    'Respirar, resetear manos y repetir mentalmente la regla de la sesión.',
    'rest',
  );

  const ranked = makeBlock(
    'coach-ranked-objective',
    focusAreaId,
    'Ranked con objetivo',
    'Bloque competitivo corto donde el objetivo no es ganar a cualquier costo, sino sostener la regla de la sesión.',
    20,
    `Jugar ranked midiendo solamente si se cumple la regla de ${focusAreaName}. Cortar el bloque si aparecen 2 errores iguales seguidos.`,
    'ranked_objective',
  );

  if (focusAreaId === 'offence') {
    return applyPrimaryTrainingPack([
      makeBlock('coach-freeplay-offence', 'offence', 'Freeplay de tiros limpios', 'Calentamiento ofensivo con tiros simples, follow-up y control del primer toque.', 15, 'Priorizar tiros limpios sobre toques fuertes sin ángulo.', 'freeplay'),
      makeBlock('coach-internal-offence', 'offence', 'Training interno ofensivo', 'Usar entrenamiento interno del juego para repetir tiros básicos y finalizar jugadas fáciles.', 20, 'Buscar precisión y decisión rápida: tirar, pasar o controlar.', 'training_pack'),
      baseReview,
      rest,
      makeBlock('coach-casual-offence', 'offence', 'Casual con selección de tiro', 'Partida casual para probar decisiones ofensivas sin presión de rango.', 15, 'No disparar por reflejo: elegir tiro solo con ángulo o ventaja clara.', 'casual_objective'),
      ranked,
    ], primaryPack);
  }

  if (focusAreaId === 'defence') {
    return applyPrimaryTrainingPack([
      baseReview,
      makeBlock('coach-internal-defence', 'defence', 'Training interno defensivo', 'Rutina interna de saves, clears simples y primeras reacciones sin panic jump.', 20, 'Primera prioridad: tocar fuerte hacia zona segura, no hacia el centro.', 'training_pack'),
      makeBlock('coach-duel-defence', 'defence', '1v1 defensivo', 'Partida 1v1 para castigar malas decisiones defensivas y entrenar paciencia.', 15, 'No lanzarse al primer challenge; sombra hasta tener ángulo real.', 'duel_objective'),
      rest,
      makeBlock('coach-casual-defence', 'defence', 'Casual con back post', 'Partida casual con foco único en volver por back post y cubrir segundo toque.', 15, 'Entrar a defensa desde back post antes de desafiar.', 'casual_objective'),
      ranked,
    ], primaryPack);
  }

  if (focusAreaId === 'boost') {
    return applyPrimaryTrainingPack([
      makeBlock('coach-freeplay-boost', 'boost', 'Freeplay de rutas pequeñas', 'Recorrer rutas de pads pequeños mientras mantenés velocidad útil y cámara controlada.', 20, 'Llegar a cada jugada con pads pequeños sin abandonar posición.', 'freeplay'),
      baseReview,
      makeBlock('coach-casual-boost', 'boost', 'Casual con gestión de boost', 'Partida casual donde no se persigue boost grande si eso rompe la rotación.', 20, 'No salir de la jugada por boost grande; priorizar pads pequeños.', 'casual_objective'),
      rest,
      makeBlock('coach-duel-boost', 'boost', '1v1 con economía de boost', 'Partida 1v1 corta para castigar sobreuso de boost bajo presión.', 10, 'No gastar boost para corregir decisiones tardías; recuperar con pads.', 'duel_objective'),
      ranked,
    ], primaryPack);
  }

  if (focusAreaId === 'movement') {
    return applyPrimaryTrainingPack([
      makeBlock('coach-freeplay-movement', 'movement', 'Freeplay de recoveries', 'Calentamiento técnico con landings, half flips, wave dash y control de supersonic.', 25, 'Después de cada toque, aterrizar con ruedas y recuperar línea de juego.', 'freeplay'),
      makeBlock('coach-internal-movement', 'movement', 'Training interno de control', 'Usar entrenamiento interno para repetir contactos simples priorizando aterrizaje y salida.', 15, 'No medir solo el tiro: medir la recuperación después del tiro.', 'training_pack'),
      baseReview,
      rest,
      makeBlock('coach-casual-movement', 'movement', 'Casual con recoveries', 'Partida casual donde cada mala recuperación cuenta como error de sesión.', 15, 'Evitar quedar mirando la jugada después de saltar o fallar.', 'casual_objective'),
      ranked,
    ], primaryPack);
  }

  if (focusAreaId === 'rotation' || focusAreaId === 'positioning') {
    return applyPrimaryTrainingPack([
      baseReview,
      makeBlock('coach-freeplay-positioning', 'movement', 'Freeplay de salida limpia', 'Calentamiento corto para llegar rápido a la jugada sin perder control del coche.', 10, 'Tocar y salir; no quedarse debajo de la pelota después del primer contacto.', 'freeplay'),
      makeBlock('coach-casual-positioning', focusAreaId, 'Casual con regla de segundo hombre', 'Partida casual con una regla simple para corregir spacing, overcommit o ball chasing.', 20, `No entrar si el compañero ya está comprometido. Prioridad: cubrir la siguiente jugada, no ganar la actual.`, 'casual_objective'),
      rest,
      makeBlock('coach-duel-positioning', 'defence', '1v1 de paciencia', 'Partida 1v1 corta para reforzar distancia a la pelota y control de challenge.', 15, 'Esperar un toque extra antes de desafiar si no hay ángulo claro.', 'duel_objective'),
      ranked,
      makeBlock('coach-notes', focusAreaId, 'Cierre de sesión', 'Registrar si la regla se cumplió y qué situación la rompió más.', 5, `Escribir una frase: “Mi error de ${safeError} apareció cuando...”.`, 'replay_review'),
    ], primaryPack);
  }

  return applyPrimaryTrainingPack([
    makeBlock('coach-freeplay-generic', focusAreaId, `Freeplay enfocado en ${focusAreaName}`, 'Bloque de calentamiento con objetivo único y medible.', 15, `Trabajar ${focusAreaName} sin añadir mecánicas nuevas.`, 'freeplay'),
    baseReview,
    makeBlock('coach-internal-generic', focusAreaId, 'Training interno dirigido', 'Rutina interna simple para repetir situaciones relacionadas con el foco del día.', 20, `Repetir decisiones de ${focusAreaName} sin buscar clips ni jugadas complejas.`, 'training_pack'),
    rest,
    makeBlock('coach-casual-generic', focusAreaId, 'Casual con objetivo', 'Partida casual con una regla concreta antes de pasar a ranked.', 15, `Cumplir la regla de ${focusAreaName} durante toda la partida.`, 'casual_objective'),
    ranked,
  ], primaryPack);
}


function applyPrimaryTrainingPack(blocks: TrainingBlock[], primaryPack?: TrainingPackRecommendation | null): TrainingBlock[] {
  if (!primaryPack) return blocks;
  let applied = false;
  return blocks.map((block) => {
    if (block.blockType !== 'training_pack' || applied) return block;
    applied = true;
    return {
      ...block,
      trainingPackId: primaryPack.pack.id,
      trainingPackCode: primaryPack.pack.code,
      title: `Pack recomendado · ${primaryPack.pack.name}`,
      description: `${primaryPack.pack.creator} · ${primaryPack.pack.sourceName}.`,
      durationMinutes: primaryPack.pack.durationMinutes || block.durationMinutes,
      objective: primaryPack.pack.objective,
      targetRepetitions: primaryPack.pack.shots ?? block.targetRepetitions,
    };
  });
}

function normalizeBlocksTo90(blocks: TrainingBlock[]): TrainingBlock[] {
  const total = blocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  if (total === 90 || !blocks.length) return blocks;
  const rankedIndex = blocks.findIndex((block) => block.blockType === 'ranked_objective');
  const targetIndex = rankedIndex >= 0 ? rankedIndex : blocks.length - 1;
  const delta = 90 - total;
  return blocks.map((block, index) => index === targetIndex ? { ...block, durationMinutes: Math.max(5, block.durationMinutes + delta) } : block);
}

export function buildSessionCoachPlan(store: RocketLeagueDataStore): SessionCoachPlan {
  const recentMatches = store.matches.slice(0, 10);
  const importedMatches = recentMatches.filter((match) => match.source === 'replay_parser').length;
  const active = activeError(store.frequentErrors);
  const focusAreaId = recentMatches.length ? weakestAreaFromMatches(store, recentMatches) : (store.profile.weakAreas[0] ?? 'positioning');
  const secondaryAreaId = recentMatches.length ? secondaryArea(store, recentMatches, focusAreaId) : null;
  const focusAreaName = areaName(focusAreaId, store.skillAreas);
  const secondaryAreaName = secondaryAreaId ? areaName(secondaryAreaId, store.skillAreas) : 'Sin área secundaria';
  const wins = recentMatches.filter((match) => match.result === 'victoria').length;
  const losses = recentMatches.filter((match) => match.result === 'derrota').length;
  const draws = recentMatches.filter((match) => match.result === 'empate').length;
  const goalsFor = recentMatches.reduce((total, match) => total + ownGoals(match), 0);
  const goalsAgainst = recentMatches.reduce((total, match) => total + opponentGoals(match), 0);
  const averageScore = averageNumbers(recentMatches.map(matchScore).filter((score) => score > 0));
  const confidence = confidenceFromMatches(importedMatches, recentMatches.length);
  const readiness = readinessFromMatches(importedMatches, recentMatches.length);
  const hasData = recentMatches.length > 0;
  const mainErrorTitle = active?.title ?? 'Sin error crítico repetido';
  const trainingPacks = recommendTrainingPacksForArea({ store, areaId: focusAreaId, maxResults: 3 });
  const blocks = normalizeBlocksTo90(buildBlocksForFocus(focusAreaId, focusAreaName, mainErrorTitle, trainingPacks[0]));
  const winRate = calculateWinRate(recentMatches);
  const goalDiff = goalsFor - goalsAgainst;

  const summary = hasData
    ? active
      ? `La tendencia principal de la sesión apunta a ${focusAreaName}: ${active.title} aparece como patrón de mayor impacto.`
      : `No hay error crítico repetido. El foco se asigna por área más baja de la sesión: ${focusAreaName}.`
    : 'Importá o registrá partidas para generar un plan por tendencia. Mientras tanto se usa una rutina base de posicionamiento.';

  const whyThisFocus = active
    ? active.suggestedFix
    : hasData
      ? `Últimas ${recentMatches.length} partidas: ${wins}V/${losses}D/${draws}E, goles ${goalsFor}-${goalsAgainst}. Se prioriza el área con score más bajo y señal confiable.`
      : 'Sin partidas suficientes; el sistema prioriza fundamentos de posicionamiento y decisión.';

  return {
    hasData,
    readiness,
    focusAreaId,
    focusAreaName,
    secondaryAreaId,
    secondaryAreaName,
    mainErrorId: active?.id ?? '',
    mainErrorTitle,
    severity: active?.severity ?? 'baja',
    confidence,
    analysedMatches: recentMatches.length,
    importedMatches,
    sessionWindowLabel: readinessLabel(readiness),
    winRate,
    wins,
    losses,
    draws,
    goalsFor,
    goalsAgainst,
    goalDiff,
    averageScore,
    summary,
    whyThisFocus,
    nextMatchObjective: `Siguiente partida: jugar con una sola regla de ${focusAreaName}. Si dudás, priorizá cobertura y recuperación antes que forzar la jugada.`,
    rankedRule: `Entrar a ranked solo después de completar el bloque casual/1v1 y poder explicar el foco de ${focusAreaName} en una frase.`,
    reviewQuestion: active
      ? `¿En qué momento apareció ${active.title} y qué opción segura existía?`
      : `¿Qué decisión buena se repitió en la victoria y cómo la convierto en hábito?`,
    successCriteria: [
      `Completar al menos 70% de los bloques del plan.`,
      `Registrar una nota concreta sobre ${focusAreaName}.`,
      `Jugar una partida con el objetivo activo sin cambiar de foco a mitad.`,
    ],
    blocks,
    trainingPacks,
    tomorrowRoutineTitle: trainingPacks[0] ? `${trainingPacks[0].pack.name} + objetivo de ${focusAreaName}` : `Rutina interna de ${focusAreaName}`,
    tomorrowRoutineSummary: trainingPacks[0] ? `Mañana: ${trainingPacks[0].pack.durationMinutes} min en ${trainingPacks[0].pack.name}, copiar código ${trainingPacks[0].pack.code} y cerrar con una partida aplicando la regla de sesión.` : `Mañana: bloque interno de ${focusAreaName} y replay review manual.`,
    signals: [
      `${recentMatches.length} partidas analizadas`,
      `${importedMatches} importadas desde replay`,
      `${winRate}% win rate reciente`,
      `Goles ${goalsFor}-${goalsAgainst}`,
    ],
  };
}
