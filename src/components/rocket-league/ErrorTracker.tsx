import { useMemo, useState } from 'react';
import type { ErrorStatus, FrequentError, SkillArea, SkillAreaId } from '../../types/rocketLeague';
import { StatusBadge } from '../cards/StatusBadge';
import { Tag } from '../cards/Tag';

const statusOptions: Array<'todos' | ErrorStatus> = ['todos', 'activo', 'bajando', 'resuelto'];
const areaOptions: Array<'todas' | SkillAreaId> = ['todas', 'movement', 'boost', 'offence', 'defence', 'rotation', 'positioning'];

function areaLabel(areaId: SkillAreaId, areas: SkillArea[]) {
  return areas.find((area) => area.id === areaId)?.name ?? areaId;
}

function statusTone(status?: ErrorStatus) {
  if (status === 'resuelto') return 'improvement';
  if (status === 'bajando') return 'warning';
  return 'decline';
}

function severityTone(severity: FrequentError['severity']) {
  if (severity === 'critica') return 'decline';
  if (severity === 'alta') return 'warning';
  if (severity === 'media') return 'violet';
  return 'neutral';
}

function formatLastSeen(value: string) {
  if (!value) return 'Sin registro';
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export function ErrorTracker({ errors, areas }: { errors: FrequentError[]; areas: SkillArea[] }) {
  const [statusFilter, setStatusFilter] = useState<'todos' | ErrorStatus>('todos');
  const [areaFilter, setAreaFilter] = useState<'todas' | SkillAreaId>('todas');
  const [selectedErrorId, setSelectedErrorId] = useState(errors[0]?.id ?? '');

  const filteredErrors = useMemo(() => {
    return errors
      .filter((error) => statusFilter === 'todos' || (error.status ?? 'activo') === statusFilter)
      .filter((error) => areaFilter === 'todas' || error.areaId === areaFilter)
      .sort((a, b) => b.appearances - a.appearances || b.impactScore - a.impactScore || a.title.localeCompare(b.title));
  }, [areaFilter, errors, statusFilter]);

  const selectedError = errors.find((error) => error.id === selectedErrorId) ?? filteredErrors[0] ?? null;
  const totalFrequency = errors.reduce((sum, error) => sum + error.appearances, 0);
  const detectedErrors = errors.filter((error) => error.appearances > 0 || error.impactScore > 0);
  const activeCount = detectedErrors.filter((error) => (error.status ?? 'activo') !== 'resuelto').length;
  const resolvedCount = errors.filter((error) => error.status === 'resuelto').length;

  return (
    <div className="error-page">
      <section className="error-hero analyzer-card">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-100/60">Vista 6</p>
            <h2 className="mt-1 text-3xl font-black text-white">Error Tracker</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-400">
              Catálogo de patrones para convertir errores en acciones concretas. Las frecuencias arrancan en 0 hasta registrar partidas.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[460px]">
            <FilterGroup label="Estado" value={statusFilter} options={statusOptions} onChange={(value) => setStatusFilter(value as 'todos' | ErrorStatus)} />
            <FilterGroup label="Área" value={areaFilter} options={areaOptions} onChange={(value) => setAreaFilter(value as 'todas' | SkillAreaId)} getLabel={(value) => (value === 'todas' ? 'Todas' : areaLabel(value as SkillAreaId, areas))} />
          </div>
        </div>
      </section>

      <section className="error-stats-grid">
        <TrackerStat label="Frecuencia total" value={totalFrequency} helper="Eventos detectados" />
        <TrackerStat label="Errores detectados" value={activeCount} helper="Con frecuencia real" />
        <TrackerStat label="Patrones disponibles" value={errors.length} helper={`${resolvedCount} resueltos manualmente`} />
      </section>

      <section className="error-workbench">
        <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Patrones detectables</p>
              <h3 className="mt-1 text-xl font-black text-white">Errores frecuentes</h3>
            </div>
            <StatusBadge tone="neutral">{filteredErrors.length}</StatusBadge>
          </div>

          <div className="mt-4 grid gap-3">
            {filteredErrors.map((error) => (
              <button
                key={error.id}
                type="button"
                onClick={() => setSelectedErrorId(error.id)}
                className={`rounded-[1.25rem] border p-4 text-left transition ${
                  selectedError?.id === error.id ? 'border-cyan-300/38 bg-cyan-300/[0.075]' : 'border-white/8 bg-slate-950/38 hover:border-white/16 hover:bg-white/[0.045]'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black text-white">{error.title}</p>
                      <StatusBadge tone={statusTone(error.status)}>{error.status ?? 'activo'}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{error.description}</p>
                  </div>
                  <div className="grid min-w-[220px] grid-cols-3 gap-2 text-center">
                    <MiniStat label="Freq." value={error.appearances} />
                    <MiniStat label="Impacto" value={error.impactScore} />
                    <MiniStat label="Última" value={formatLastSeen(error.lastSeenAt)} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tag>{areaLabel(error.areaId, areas)}</Tag>
                  <StatusBadge tone={severityTone(error.severity)}>{error.severity}</StatusBadge>
                  <Tag>Drill manual</Tag>
                </div>
              </button>
            ))}
          </div>
        </article>

        <ErrorActionPanel error={selectedError} areas={areas} />
      </section>
    </div>
  );
}

function ErrorActionPanel({ error, areas }: { error: FrequentError | null; areas: SkillArea[] }) {
  if (!error) {
    return (
      <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
        <p className="text-sm font-bold text-slate-500">No hay errores para mostrar.</p>
      </article>
    );
  }

  return (
    <article className="rounded-[1.5rem] border border-orange-300/14 bg-orange-300/[0.045] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-orange-100/60">Error → Acción</p>
          <h3 className="mt-1 text-2xl font-black text-white">{error.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-orange-50/70">{error.description}</p>
        </div>
        <StatusBadge tone={statusTone(error.status)}>{error.status ?? 'activo'}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <DetailCard label="Área relacionada" value={areaLabel(error.areaId, areas)} />
        <DetailCard label="Nivel de impacto" value={`${error.impactScore}`} />
        <DetailCard label="Frecuencia" value={`${error.appearances}`} />
        <DetailCard label="Última vez" value={formatLastSeen(error.lastSeenAt)} />
      </div>

      <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/60">Recomendación</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{error.suggestedFix}</p>
      </div>

      <div className="mt-4 rounded-[1.25rem] border border-emerald-300/14 bg-emerald-300/[0.06] p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/60">Drill sugerido</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50/80">{error.suggestedDrill ?? 'Registrar una sesión manual enfocada en este patrón.'}</p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <button type="button" className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/18">Crear foco</button>
        <button type="button" className="rounded-2xl border border-violet-300/25 bg-violet-300/10 px-4 py-3 text-sm font-black text-violet-100 hover:bg-violet-300/16">Revisar replay</button>
        <button type="button" className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/[0.07]">Marcar seguimiento</button>
      </div>
    </article>
  );
}

function FilterGroup({ label, value, options, onChange, getLabel }: { label: string; value: string; options: string[]; onChange: (value: string) => void; getLabel?: (value: string) => string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm font-black text-slate-200 outline-none transition focus:border-cyan-300/50">
        {options.map((option) => <option key={option} value={option}>{getLabel ? getLabel(option) : option}</option>)}
      </select>
    </label>
  );
}

function TrackerStat({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-500">{helper}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-2xl border border-white/8 bg-white/[0.035] px-2 py-2">
      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className="mt-0.5 block truncate text-xs font-black text-white">{value}</span>
    </span>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/38 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}
