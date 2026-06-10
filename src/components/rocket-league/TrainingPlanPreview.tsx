import { formatMinutes } from '../../lib/formatters';
import type { TrainingSession } from '../../types/rocketLeague';

interface TrainingPlanPreviewProps {
  sessions: TrainingSession[];
}

export function TrainingPlanPreview({ sessions }: TrainingPlanPreviewProps) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Entrenamientos recientes</p>
      <h2 className="mt-2 text-2xl font-black text-white">Bloques listos para persistencia</h2>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {sessions.map((session) => (
          <article key={session.id} className="rounded-3xl border border-white/8 bg-white/[0.035] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-white">{session.title}</p>
                <p className="mt-1 text-sm text-slate-500">Foco: {session.focusAreaId}</p>
              </div>
              <span className="rounded-full border border-emerald-300/15 bg-emerald-300/8 px-3 py-1 text-sm font-black text-emerald-100">
                {formatMinutes(session.durationMinutes)}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {session.blocks.map((block) => (
                <div key={block.id} className="rounded-2xl border border-white/8 bg-slate-950/40 p-3">
                  <p className="font-bold text-slate-200">{block.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{block.description}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/60">Pack: {block.trainingPackCode}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
