'use client';

import { useState } from 'react';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

// Condition adjustment and renovation/improvement uplifts (indicative %).
const CONDITIONS: { id: string; pct: number }[] = [
  { id: 'tresbon', pct: 5 },
  { id: 'bon', pct: 0 },
  { id: 'rafraichir', pct: -7 },
  { id: 'gros', pct: -18 },
];
const WORKS: { id: string; pct: number }[] = [
  { id: 'dpe', pct: 8 },
  { id: 'cuisine', pct: 3 },
  { id: 'piscine', pct: 6 },
  { id: 'veranda', pct: 5 },
];

export function WorksSimulator({ initialValue, locale }: { initialValue?: number | null; locale: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState<number>(initialValue && initialValue > 0 ? Math.round(initialValue) : 0);
  const [condition, setCondition] = useState('bon');
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const condPct = CONDITIONS.find((c) => c.id === condition)?.pct ?? 0;
  const worksPct = WORKS.reduce((s, w) => s + (picked[w.id] ? w.pct : 0), 0);
  const totalPct = condPct + worksPct;
  const newValue = Math.round(value * (1 + totalPct / 100));
  const uplift = newValue - value;
  const maxWorks = WORKS.reduce((s, w) => s + w.pct, 0); // optimisation potential
  const condLabel: Record<string, string> = { tresbon: t.condTresBon, bon: t.condBon, rafraichir: t.condRafraichir, gros: t.condGros };
  const workLabel: Record<string, string> = { dpe: t.workDpe, cuisine: t.workCuisine, piscine: t.workPiscine, veranda: t.workVeranda };

  return (
    <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.worksTitle}</h2>
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">{t.worksValue}</span>
            <input type="number" inputMode="numeric" value={value || ''} onChange={(e) => setValue(Number(e.target.value) || 0)}
              placeholder="ex : 350 000"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>

          <div>
            <span className="text-[11px] font-medium text-slate-500">{t.worksCondition}</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button key={c.id} onClick={() => setCondition(c.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${condition === c.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {condLabel[c.id]}{c.pct !== 0 ? ` (${c.pct > 0 ? '+' : ''}${c.pct}%)` : ''}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500">{t.worksImprovements}</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {WORKS.map((w) => (
                <button key={w.id} onClick={() => setPicked((p) => ({ ...p, [w.id]: !p[w.id] }))}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${picked[w.id] ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <span>{workLabel[w.id]}</span>
                  <span className="text-xs font-semibold">+{w.pct}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t.worksUplift}</span>
            <span className={`font-semibold ${uplift >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{uplift >= 0 ? '+' : ''}{formatEUR(uplift, locale)}</span>
          </div>
          <div className="my-2 border-t border-slate-200" />
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{t.worksNewValue}</div>
          <div className="text-2xl font-bold text-brand-800">{value ? formatEUR(newValue, locale) : '—'}</div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{t.worksPotential}</span><span>{worksPct}/{maxWorks}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${maxWorks ? (worksPct / maxWorks) * 100 : 0}%` }} />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-slate-400">{t.worksDisclaimer}</p>
    </section>
  );
}
