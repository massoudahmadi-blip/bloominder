'use client';

export type Tone = 'good' | 'warn' | 'bad' | 'brand' | 'neutral';

const TONE: Record<Tone, string> = {
  good: 'text-emerald-600',
  warn: 'text-amber-600',
  bad: 'text-rose-600',
  brand: 'text-brand-700',
  neutral: 'text-slate-900',
};

export interface KpiItem {
  label: string;
  value: string;
  tone?: Tone;
  sub?: string;
}

/** A prominent one-glance strip of headline figures (report executive summary). */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center">
          <div className={`text-lg font-bold leading-tight ${TONE[it.tone ?? 'neutral']}`}>{it.value}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{it.label}</div>
          {it.sub && <div className="mt-0.5 text-[10px] text-slate-400">{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
