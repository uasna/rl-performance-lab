import type { ImprovementState, MatchResult, MatchType, TrendDirection } from '../types/rocketLeague';

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-HN', { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);
}

export function formatMMR(value: number): string {
  return `${formatNumber(value)} MMR`;
}

export function formatSignedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

export function formatPercent(value: number): string {
  return `${Math.round(Number.isFinite(value) ? value : 0)}%`;
}

export function formatMinutes(value: number): string {
  return `${formatNumber(value)} min`;
}

export function formatSecondsAsMinutes(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatRecord(wins: number, losses: number, draws: number): string {
  return `${wins}V / ${losses}D / ${draws}E`;
}

export function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: 'short' }).format(date);
}

export function formatFullDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDateInput(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function resultLabel(result: MatchResult): string {
  const labels: Record<MatchResult, string> = {
    victoria: 'Victoria',
    derrota: 'Derrota',
    empate: 'Empate',
    sin_registro: 'Sin registro',
  };
  return labels[result];
}

export function matchTypeLabel(matchType: MatchType | undefined): string {
  if (!matchType) return 'Sin tipo';
  return matchType;
}

export function trendLabel(trend: TrendDirection): string {
  const labels: Record<TrendDirection, string> = {
    up: 'Subiendo',
    down: 'Bajando',
    stable: 'Estable',
  };
  return labels[trend];
}

export function improvementStateLabel(state: ImprovementState): string {
  const labels: Record<ImprovementState, string> = {
    improving: 'Mejorando',
    stable: 'Estable',
    declining: 'En caída',
  };
  return labels[state];
}
