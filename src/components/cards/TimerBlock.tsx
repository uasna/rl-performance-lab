import { useEffect, useMemo, useState } from 'react';
import { formatMinutes } from '../../lib/formatters';

export function TimerBlock({ recommendedMinutes }: { recommendedMinutes: number }) {
  const initialSeconds = Math.max(1, recommendedMinutes) * 60;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [running, setRunning] = useState(false);


  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const progress = useMemo(() => 100 - (secondsLeft / initialSeconds) * 100, [initialSeconds, secondsLeft]);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <article className="rounded-[1.5rem] border border-cyan-300/16 bg-cyan-300/[0.07] p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/65">Timer de bloque</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-5xl font-black tabular-nums tracking-tight text-white">{minutes}:{String(seconds).padStart(2, '0')}</p>
          <p className="mt-2 text-sm font-semibold text-cyan-100/70">Sesión objetivo: {formatMinutes(recommendedMinutes)}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRunning((value) => !value)} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-300/18">
            {running ? 'Pausar' : 'Iniciar'}
          </button>
          <button type="button" onClick={() => { setRunning(false); setSecondsLeft(initialSeconds); }} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-black text-slate-200 hover:bg-white/[0.07]">
            Reset
          </button>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
    </article>
  );
}
