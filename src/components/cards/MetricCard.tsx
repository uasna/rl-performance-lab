import type { ReactNode } from 'react';

type MetricTone = 'cyan' | 'violet' | 'emerald' | 'orange' | 'red' | 'slate';

const toneClasses: Record<MetricTone, string> = {
  cyan: 'border-cyan-300/18 bg-cyan-300/[0.075] text-cyan-100 shadow-cyan-950/20',
  violet: 'border-violet-300/18 bg-violet-300/[0.075] text-violet-100 shadow-violet-950/20',
  emerald: 'border-emerald-300/18 bg-emerald-300/[0.075] text-emerald-100 shadow-emerald-950/20',
  orange: 'border-orange-300/18 bg-orange-300/[0.075] text-orange-100 shadow-orange-950/20',
  red: 'border-red-300/18 bg-red-300/[0.075] text-red-100 shadow-red-950/20',
  slate: 'border-white/10 bg-white/[0.035] text-slate-100 shadow-black/10',
};

export function MetricCard({
  label,
  value,
  helper,
  tone = 'slate',
  meta,
  action,
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: MetricTone;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <article className={`rounded-[1.35rem] border p-4 shadow-xl ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-current/65">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{value}</p>
        </div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </div>
      {helper ? <p className="mt-3 text-sm font-semibold leading-5 text-current/70">{helper}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </article>
  );
}
