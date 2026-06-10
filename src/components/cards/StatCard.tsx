interface StatCardProps {
  label: string;
  value: string | number;
  helper?: string;
  tone?: 'cyan' | 'violet' | 'emerald' | 'orange' | 'neutral';
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, string> = {
  cyan: 'border-cyan-300/18 bg-cyan-300/8 text-cyan-100',
  violet: 'border-violet-300/18 bg-violet-300/8 text-violet-100',
  emerald: 'border-emerald-300/18 bg-emerald-300/8 text-emerald-100',
  orange: 'border-orange-300/18 bg-orange-300/8 text-orange-100',
  neutral: 'border-white/10 bg-white/[0.035] text-slate-100',
};

export function StatCard({ label, value, helper, tone = 'neutral' }: StatCardProps) {
  return (
    <article className={`rounded-[1.5rem] border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-5 text-slate-400">{helper}</p> : null}
    </article>
  );
}
