import type { RocketLeagueDataStore } from '../../types/rocketLeague';

interface DataModelPreviewCardProps {
  store: RocketLeagueDataStore;
}

export function DataModelPreviewCard({ store }: DataModelPreviewCardProps) {
  const modules = [
    { label: 'PlayerProfile', count: 0, description: store.profile.playerName },
    { label: 'RocketLeagueMatch', count: store.matches.length, description: 'Partidas persistibles' },
    { label: 'TrainingSession', count: store.trainingSessions.length, description: 'Sesiones de entrenamiento' },
    { label: 'SkillMetric', count: store.skillMetrics.length, description: 'Métricas por área' },
    { label: 'FrequentError', count: store.frequentErrors.length, description: 'Errores detectables' },
    { label: 'RankSnapshot', count: store.rankHistory.length, description: 'Historial de MMR' },
    { label: 'DailyProgress', count: store.dailyProgress.length + store.weeklyProgress.length + store.monthlyProgress.length, description: 'Progreso diario/semanal/mensual' },
    { label: 'Settings', count: 1, description: 'Configuración local persistible' },
  ];

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Arquitectura de datos</p>
          <h2 className="mt-2 text-2xl font-black text-white">Modelo principal conectado a la app</h2>
        </div>
        <p className="text-sm text-slate-500">Mock + localStorage · API-ready</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <div key={module.label} className="rounded-3xl border border-white/8 bg-white/[0.035] p-4">
            <p className="font-black text-white">{module.label}</p>
            <p className="mt-1 text-sm text-slate-500">{module.description}</p>
            <p className="mt-3 text-2xl font-black text-cyan-100">{module.count}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
