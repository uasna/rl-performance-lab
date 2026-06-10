import type { ReactNode } from 'react';

export function Tag({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
        active ? 'border-cyan-300/35 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-white/[0.035] text-slate-400'
      }`}
    >
      {children}
    </span>
  );
}
