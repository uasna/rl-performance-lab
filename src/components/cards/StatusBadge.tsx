import type { ReactNode } from 'react';

type StatusTone = 'win' | 'loss' | 'neutral' | 'improvement' | 'warning' | 'decline' | 'info' | 'violet';

const toneClasses: Record<StatusTone, string> = {
  win: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  loss: 'border-orange-300/25 bg-orange-300/10 text-orange-100',
  neutral: 'border-white/10 bg-white/[0.04] text-slate-300',
  improvement: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
  warning: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  decline: 'border-red-300/25 bg-red-300/10 text-red-100',
  info: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
  violet: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
};

export function StatusBadge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: StatusTone; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${toneClasses[tone]}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_12px_currentColor]" /> : null}
      {children}
    </span>
  );
}
