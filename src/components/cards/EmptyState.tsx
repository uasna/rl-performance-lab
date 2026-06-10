import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-[220px] place-items-center rounded-[1.5rem] border border-dashed border-white/12 bg-slate-950/45 p-6 text-center">
      <div className="max-w-sm">
        <div className="mx-auto h-10 w-10 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 shadow-[0_0_24px_rgba(103,232,249,0.10)]" />
        <h3 className="mt-4 text-lg font-black text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}
