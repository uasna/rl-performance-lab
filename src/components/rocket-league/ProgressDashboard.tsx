import { useMemo } from 'react';
import { MetricCard } from '../cards/MetricCard';
import { StatusBadge } from '../cards/StatusBadge';
import { EmptyState } from '../cards/EmptyState';
import { MMRChart } from '../charts/MMRChart';
import { ProgressChart } from '../charts/ProgressChart';
import { SkillRadar } from '../charts/SkillRadar';
import { RankSyncPanel } from './RankSyncPanel';
import type { DailyProgress, DerivedRocketLeagueMetrics, RocketLeagueDataStore, RocketLeagueMatch, TrainingSession } from '../../types/rocketLeague';
import { formatMinutes, formatPercent, formatSignedNumber } from '../../lib/formatters';

function safeNumber(value: number | undefined | null): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function weekKey(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - firstDay.getTime();
  const week = Math.ceil((diff / 86400000 + firstDay.getDay() + 1) / 7);
  return `Semana ${String(week).padStart(2, '0')}`;
}

function aggregateWeeklyMatches(matches: RocketLeagueMatch[]) {
  const map = new Map<string, { label: string; wins: number; losses: number; mmrDelta: number; matches: number }>();
  matches.forEach((match) => {
    const key = weekKey(match.playedAt);
    const current = map.get(key) ?? { label: key, wins: 0, losses: 0, mmrDelta: 0, matches: 0 };
    current.matches += 1;
    current.wins += match.result === 'victoria' ? 1 : 0;
    current.losses += match.result === 'derrota' ? 1 : 0;
    current.mmrDelta += safeNumber(match.rankSnapshot.mmrDelta);
    map.set(key, current);
  });
  return [...map.values()].slice(-8);
}

function winRateForWeek(week: { wins: number; losses: number }) {
  const decided = week.wins + week.losses;
  if (decided === 0) return 0;
  return Math.round((week.wins / decided) * 100);
}

function getLongestActivityStreak(progress: DailyProgress[]): number {
  const activeDays = [...progress]
    .filter((day) => safeNumber(day.playedMatches) > 0 || safeNumber(day.trainingMinutes) > 0)
    .map((day) => day.date)
    .sort();
  if (activeDays.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let index = 1; index < activeDays.length; index += 1) {
    const prev = new Date(activeDays[index - 1]).getTime();
    const next = new Date(activeDays[index]).getTime();
    if (next - prev === 86400000) current += 1;
    else current = 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function totals(progress: DailyProgress[]) {
  return progress.reduce(
    (acc, day) => ({
      playedMatches: acc.playedMatches + safeNumber(day.playedMatches),
      wins: acc.wins + safeNumber(day.wins),
      losses: acc.losses + safeNumber(day.losses),
      trainingMinutes: acc.trainingMinutes + safeNumber(day.trainingMinutes),
      mmrDelta: acc.mmrDelta + safeNumber(day.mmrDelta),
      completedBlocks: acc.completedBlocks + safeNumber(day.completedBlocks),
      totalBlocks: acc.totalBlocks + safeNumber(day.totalBlocks),
    }),
    { playedMatches: 0, wins: 0, losses: 0, trainingMinutes: 0, mmrDelta: 0, completedBlocks: 0, totalBlocks: 0 },
  );
}

function compareLabel(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return 'Sin cambio';
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function buildProgressFromTraining(sessions: TrainingSession[]): DailyProgress[] {
  return sessions.map((session) => ({
    id: `training-progress-${session.id}`,
    date: session.startedAt.slice(0, 10),
    playedMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    trainingMinutes: session.durationMinutes,
    mmrStart: 0,
    mmrEnd: 0,
    mmrDelta: 0,
    completedBlocks: session.blocks.filter((block) => block.status === 'completado').length,
    totalBlocks: session.blocks.length,
    focusAreaId: session.focusAreaId,
    summary: session.notes,
    source: session.source,
  }));
}

export function ProgressDashboard({ store, summary, actions }: { store: RocketLeagueDataStore; summary: DerivedRocketLeagueMetrics; actions: Parameters<typeof RankSyncPanel>[0]['actions'] }) {
  const weeklyMatches = useMemo(() => aggregateWeeklyMatches(store.matches), [store.matches]);
  const trainingProgress = buildProgressFromTraining(store.trainingSessions);
  const allProgress = [...store.dailyProgress, ...trainingProgress];
  const last7 = summary.last7DaysProgress;
  const last30 = summary.last30DaysProgress;
  const today = totals(summary.last7DaysProgress.slice(-1));
  const sevenDays = totals(last7);
  const thirtyDays = totals(last30);
  const consistencyRanking = summary.weeklyConsistency >= 80 ? 'Elite' : summary.weeklyConsistency >= 60 ? 'Sólido' : summary.weeklyConsistency > 0 ? 'En construcción' : 'Sin datos';
  const hoursTrained = Math.round((summary.totalTrainingMinutes / 60) * 10) / 10;
  const completedSessions = store.trainingSessions.length;
  const longestStreak = getLongestActivityStreak(allProgress);
  const latestWeek = weeklyMatches.at(-1);
  const weeklyPlayedMatches = latestWeek?.matches ?? summary.weeklyTotals.playedMatches;

  return (
    <div className="progress-page">
      <section className="progress-hero analyzer-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info" dot>Vista 7</StatusBadge>
              <StatusBadge tone="neutral">Progreso local</StatusBadge>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Progress</h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-400">Panel para entender si la semana sube, se mantiene o necesita ajuste. Todo se alimenta de partidas y entrenamientos manuales.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
            <MiniCompare label="Hoy vs 7 días" value={compareLabel(today.trainingMinutes, sevenDays.trainingMinutes)} helper="minutos de entrenamiento" />
            <MiniCompare label="Hoy vs 30 días" value={compareLabel(today.playedMatches, thirtyDays.playedMatches)} helper="partidas registradas" />
          </div>
        </div>
      </section>

      <section className="progress-metric-strip">
        <MetricCard label="MMR semanal" value={formatSignedNumber(summary.weeklyTotals.mmrDelta)} helper="Delta acumulado" tone="cyan" />
        <MetricCard label="Win rate semanal" value={formatPercent(latestWeek ? winRateForWeek(latestWeek) : 0)} helper={`${weeklyPlayedMatches} partidas`} tone="violet" />
        <MetricCard label="Entrenamientos" value={completedSessions} helper={`${formatMinutes(summary.totalTrainingMinutes)} totales`} tone="emerald" />
        <MetricCard label="Horas entrenadas" value={`${hoursTrained} h`} helper="Registro manual" tone="slate" />
      </section>

      <RankSyncPanel store={store} actions={actions} compact />

      <section className="progress-main-grid">
        <MMRChart history={store.rankHistory} />
        <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Win rate por semana</p>
          <h2 className="mt-1 text-xl font-black text-white">Resultados recientes</h2>
          <div className="mt-5">
            {weeklyMatches.length === 0 ? (
              <EmptyState title="Sin semanas registradas" description="Registrá partidas para construir el win rate semanal." />
            ) : (
              <div className="grid gap-3">
                {weeklyMatches.map((week) => (
                  <div key={week.label} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-white">{week.label}</p>
                      <StatusBadge tone="info">{winRateForWeek(week)}%</StatusBadge>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-violet-200" style={{ width: `${winRateForWeek(week)}%` }} />
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-500">{week.wins}W / {week.losses}L · MMR {formatSignedNumber(week.mmrDelta)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="progress-skill-grid">
        <SkillRadar areas={store.skillAreas} />
        <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Mejoras por área</p>
          <h2 className="mt-1 text-xl font-black text-white">Áreas competitivas</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {store.skillAreas.map((area) => (
              <div key={area.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{area.name}</p>
                  <span className="text-sm font-black text-cyan-100">{area.currentScore}/100</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-200" style={{ width: `${area.currentScore}%` }} />
                </div>
                <p className="mt-2 text-xs font-bold text-slate-500">Objetivo {area.targetScore}/100 · tendencia {area.trend}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="progress-chart-grid">
        <ProgressChart progress={summary.last7DaysProgress} title="Comparación últimos 7 días" />
        <ProgressChart progress={summary.last30DaysProgress} title="Comparación últimos 30 días" />
      </section>

      <section className="progress-footer-strip">
        <MetricCard label="Racha máxima" value={longestStreak} helper="Días con actividad" tone="cyan" />
        <MetricCard label="Ranking consistencia" value={consistencyRanking} helper={`${summary.weeklyConsistency}% semanal`} tone="emerald" />
        <MetricCard label="Bloques completados" value={`${summary.weeklyTotals.completedBlocks}/${summary.weeklyTotals.totalBlocks}`} helper="Semana actual" tone="violet" />
      </section>
    </div>
  );
}

function MiniCompare({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>
    </div>
  );
}
