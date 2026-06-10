'use client';

function color(v: number | null): string {
  if (v == null) return '#cbd5e1';
  if (v >= 70) return '#10b981';
  if (v >= 45) return '#f59e0b';
  return '#ef4444';
}

export function ScoreDial({
  value,
  label,
  size = 88,
}: {
  value: number | null;
  label: string;
  size?: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - (value ?? 0) / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color(value)}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
        />
        <text
          x="50%"
          y="50%"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-slate-800 text-lg font-bold"
        >
          {value == null ? '—' : Math.round(value)}
        </text>
      </svg>
      <span className="text-xs font-medium text-slate-500">{label}</span>
    </div>
  );
}
