import { buildSessionDiagnosis } from '../../lib/diagnostics';
import type { RocketLeagueDataStore } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';

function severityTone(severity: string) {
  if (severity === 'critica') return 'decline';
  if (severity === 'alta') return 'warning';
  if (severity === 'media') return 'violet';
  return 'neutral';
}

function confidenceTone(confidence: string) {
  if (confidence === 'alta') return 'improvement';
  if (confidence === 'media') return 'info';
  return 'neutral';
}

export function SessionDiagnosisPanel({ store, compact = false }: { store: RocketLeagueDataStore; compact?: boolean }) {
  const diagnosis = buildSessionDiagnosis(store);

  return (
    <article className="rounded-[1.5rem] border border-cyan-300/14 bg-cyan-300/[0.055] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Diagnóstico inicial</p>
          <h3 className="mt-1 text-2xl font-black text-white">{diagnosis.hasData ? diagnosis.criticalAreaName : 'Esperando replays'}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-cyan-100/70">{diagnosis.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <StatusBadge tone={confidenceTone(diagnosis.confidence)}>Confianza {diagnosis.confidence}</StatusBadge>
          <StatusBadge tone={severityTone(diagnosis.severity)}>{diagnosis.severity}</StatusBadge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniDiag label="Partidas" value={diagnosis.analysedMatches} helper="últimas 10" />
        <MiniDiag label="Desde replay" value={diagnosis.importedMatches} helper="parser local" />
        <MiniDiag label="Área fuerte" value={diagnosis.strongestAreaName} helper="promedio visible" />
      </div>

      {!compact ? (
        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-slate-950/38 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Siguiente acción</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50/80">{diagnosis.nextAction}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {diagnosis.signals.map((signal) => <Tag key={signal}>{signal}</Tag>)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function MiniDiag({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/38 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>
    </div>
  );
}
