'use client';

import { YearTrend } from '@/lib/types';

// Lightweight hand-rolled SVG line chart (no chart dependency) — median €/m² per year.
export function TrendChart({ data }: { data: YearTrend[] }) {
  const points = data.filter((d) => d.median_eur_m2 != null) as Required<YearTrend>[];
  if (points.length < 2) {
    return <div className="py-6 text-center text-xs text-slate-400">—</div>;
  }

  const W = 280;
  const H = 110;
  const PAD = 8;
  const values = points.map((p) => p.median_eur_m2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - 2 * PAD);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.median_eur_m2)}`).join(' ');
  const area = `${line} L ${x(points.length - 1)} ${H - PAD} L ${x(0)} ${H - PAD} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trendFill)" />
        <path d={line} fill="none" stroke="#0d9488" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.annee} cx={x(i)} cy={y(p.median_eur_m2)} r={2.5} fill="#0d9488" />
        ))}
      </svg>
      <div className="flex justify-between px-1 text-[10px] text-slate-400">
        {points.map((p) => (
          <span key={p.annee}>{p.annee}</span>
        ))}
      </div>
    </div>
  );
}
