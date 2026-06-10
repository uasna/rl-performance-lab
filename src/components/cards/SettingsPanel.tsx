import { useState } from 'react';
import type { RocketLeagueSettings } from '../../types/rocketLeague';
import { StatusBadge } from './StatusBadge';

type SettingsAction = (settings: Partial<RocketLeagueSettings>) => void;

export function SettingsPanel({
  settings,
  onUpdateSettings,
  onExport,
  onImport,
  onReset,
}: {
  settings: RocketLeagueSettings;
  onUpdateSettings: SettingsAction;
  onExport: () => string;
  onImport: (payload: string) => { ok: boolean; error?: string };
  onReset: () => void;
}) {
  const [minutes, setMinutes] = useState(String(settings.preferredTrainingMinutes));
  const [payload, setPayload] = useState('');
  const [feedback, setFeedback] = useState('');

  async function handleExport() {
    const data = onExport();
    try {
      await navigator.clipboard.writeText(data);
      setFeedback('Exportación copiada al portapapeles.');
    } catch {
      setPayload(data);
      setFeedback('Exportación generada en el campo de texto.');
    }
  }

  function handleSave() {
    onUpdateSettings({ preferredTrainingMinutes: Number(minutes) || settings.preferredTrainingMinutes });
    setFeedback('Configuración guardada.');
  }

  function handleImport() {
    const result = onImport(payload);
    setFeedback(result.ok ? 'Datos importados correctamente.' : result.error ?? 'No se pudo importar.');
  }

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/60">Ajustes locales</p>
          <h2 className="mt-1 text-xl font-black text-white">Datos y configuración</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Solo se guardan datos persistentes del producto: perfil, partidas, entrenamientos, métricas, progreso y configuración.</p>
        </div>
        <StatusBadge tone="info">localStorage</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[1.25rem] border border-white/8 bg-slate-950/35 p-4">
          <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-500" htmlFor="preferredTrainingMinutes">Minutos recomendados</label>
          <input
            id="preferredTrainingMinutes"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base font-black text-white outline-none focus:border-cyan-300/50"
            inputMode="numeric"
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => onUpdateSettings({ autoSave: !settings.autoSave })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/[0.07]">
              Auto guardado: {settings.autoSave ? 'ON' : 'OFF'}
            </button>
            <button type="button" onClick={() => onUpdateSettings({ showMockData: !settings.showMockData })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-slate-100 hover:bg-white/[0.07]">
              Mock data: {settings.showMockData ? 'ON' : 'OFF'}
            </button>
          </div>
          <button type="button" onClick={handleSave} className="mt-4 w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/18">
            Guardar configuración
          </button>
        </section>

        <section className="rounded-[1.25rem] border border-white/8 bg-slate-950/35 p-4">
          <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-500" htmlFor="importPayload">Importar / exportar JSON</label>
          <textarea
            id="importPayload"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder="Pegá aquí un backup exportado de RL Performance Lab"
            className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={handleExport} className="rounded-2xl border border-violet-300/30 bg-violet-300/12 px-4 py-3 text-sm font-black text-violet-100 hover:bg-violet-300/18">Exportar</button>
            <button type="button" onClick={handleImport} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300/18">Importar</button>
            <button type="button" onClick={() => { onReset(); setFeedback('Datos reiniciados.'); }} className="rounded-2xl border border-orange-300/30 bg-orange-300/12 px-4 py-3 text-sm font-black text-orange-100 hover:bg-orange-300/18">Reset</button>
          </div>
        </section>
      </div>

      {feedback ? <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-100">{feedback}</p> : null}
    </article>
  );
}
