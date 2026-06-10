import { buildSessionCoachPlan, type CoachConfidence, type CoachReadiness } from '../../lib/sessionCoach';
import type { RocketLeagueDataStore } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';
import { TrainingPackRecommendations } from './TrainingPackRecommendations';

function confidenceTone(confidence: CoachConfidence) {
  if (confidence === 'alta') return 'improvement';
  if (confidence === 'media') return 'info';
  return 'neutral';
}

function readinessText(readiness: CoachReadiness) {
  if (readiness === 'tendencia_confiable') return 'tendencia confiable';
  if (readiness === 'tendencia_util') return 'tendencia útil';
  if (readiness === 'muestra_inicial') return 'muestra inicial';
  return 'sin datos';
}

function severityTone(severity: string) {
  if (severity === 'critica') return 'decline';
  if (severity === 'alta') return 'warning';
  if (severity === 'media') return 'violet';
  return 'neutral';
}

export function SessionCoachPanel({
  store,
  compact = false,
  onOpenTraining,
}: {
  store: RocketLeagueDataStore;
  compact?: boolean;
  onOpenTraining?: () => void;
}) {
  const plan = buildSessionCoachPlan(store);

  return (
    <article className="overflow-hidden rounded-[1.65rem] border border-emerald-300/16 bg-emerald-300/[0.055] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="improvement" dot>Coach por sesión</StatusBadge>
            <StatusBadge tone={confidenceTone(plan.confidence)}>Confianza {plan.confidence}</StatusBadge>
            <StatusBadge tone={severityTone(plan.severity)}>{readinessText(plan.readiness)}</StatusBadge>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Foco de hoy: {plan.focusAreaName}
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-emerald-50/78">
            {plan.summary}
          </p>
        </div>

        <div className="grid min-w-[260px] gap-2 rounded-[1.25rem] border border-white/10 bg-slate-950/42 p-3">
          <CoachMini label="Ventana" value={plan.sessionWindowLabel} />
          <CoachMini label="Partidas" value={`${plan.analysedMatches} · replay ${plan.importedMatches}`} />
          <CoachMini label="Balance" value={`${plan.wins}V/${plan.losses}D/${plan.draws}E · ${plan.goalsFor}-${plan.goalsAgainst}`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/38 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100/60">Por qué este foco</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{plan.whyThisFocus}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.signals.map((signal) => <Tag key={signal}>{signal}</Tag>)}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/38 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100/60">Objetivo de partida</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-cyan-50/82">{plan.nextMatchObjective}</p>
          <p className="mt-3 text-xs font-bold leading-5 text-slate-500">{plan.rankedRule}</p>
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-4">
          <TrainingPackRecommendations store={store} areaId={plan.focusAreaId} />

          <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/38 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-100/60">Rutina recomendada</p>
                <h3 className="mt-1 text-xl font-black text-white">90 minutos · entrenamiento interno</h3>
              </div>
              {onOpenTraining ? (
                <button type="button" onClick={onOpenTraining} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/16">
                  Abrir Training Lab
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {plan.blocks.map((block) => (
                <div key={block.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-black text-white">{block.title}</p>
                    <Tag>{block.durationMinutes} min</Tag>
                  </div>
                  <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{block.objective}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/38 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-100/60">Criterios de éxito</p>
            <ul className="mt-3 grid gap-2">
              {plan.successCriteria.map((criteria) => (
                <li key={criteria} className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm font-bold leading-5 text-slate-200">
                  {criteria}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-2xl border border-violet-300/14 bg-violet-300/8 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-100/60">Pregunta de review</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-violet-50/85">{plan.reviewQuestion}</p>
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </article>
  );
}

function CoachMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="text-sm font-black text-white">{value}</span>
    </div>
  );
}
