import type { ReactNode } from 'react';

export function AnalyzerPanel({ kicker, title, children, action }: { kicker?: string; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="analyzer-card p-4">
      {(kicker || title || action) ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {kicker ? <p className="section-kicker">{kicker}</p> : null}
            {title ? <h2 className="mt-1 text-xl font-black text-white">{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
