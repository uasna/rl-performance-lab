interface MiniLineChartProps {
  values: number[];
  label: string;
}

export function MiniLineChart({ values, label }: MiniLineChartProps) {
  const safeValues = values.length > 0 ? values : [0];
  const width = 320;
  const height = 120;
  const minValue = Math.min(...safeValues);
  const maxValue = Math.max(...safeValues);
  const range = Math.max(maxValue - minValue, 1);
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <figure className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
      <figcaption className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>{label}</span>
        <span>{safeValues.at(-1) ?? 0}</span>
      </figcaption>
      <svg className="mt-4 h-28 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1="0" y1={height} x2={width} y2={height} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <polyline fill="none" stroke="rgba(103,232,249,0.9)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points={points} />
        {safeValues.map((value, index) => {
          const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * width;
          const y = height - ((value - minValue) / range) * height;
          return <circle key={`${value}-${index}`} cx={x} cy={y} r="4" fill="rgba(103,232,249,1)" />;
        })}
      </svg>
    </figure>
  );
}
