'use client';

import { useState } from 'react';
import { Filters as FiltersType, PropertyType } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

const TYPE_OPTIONS: (PropertyType | 'all')[] = ['all', 'Maison', 'Appartement', 'Terrain', 'Local'];

export function FilterBar({
  filters,
  onChange,
}: {
  filters: FiltersType;
  onChange: (f: FiltersType) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<FiltersType>) => onChange({ ...filters, ...patch });
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const activeCount = [
    filters.minPrice, filters.maxPrice, filters.from, filters.to,
    filters.minSurface, filters.maxSurface, filters.minLand, filters.maxLand, filters.dpe,
  ].filter((v) => v != null && v !== '').length;
  const anyActive = activeCount > 0 || filters.type !== 'all';

  return (
    <div className="z-20 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
      {/* Quick type pills */}
      <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => set({ type: opt })}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filters.type === opt ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {opt === 'all' ? t.allTypes : (t as any)[opt]}
          </button>
        ))}
      </div>

      {/* Filters button (opens floating panel) */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
        </svg>
        {t.filters}
        {activeCount > 0 && (
          <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{activeCount}</span>
        )}
      </button>

      {anyActive && (
        <button onClick={() => onChange({ type: 'all' })} className="text-xs font-medium text-slate-400 hover:text-slate-700">
          {t.reset}
        </button>
      )}

      {/* Floating filters panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-20 sm:items-center sm:pt-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg animate-fadeIn rounded-2xl bg-white p-5 shadow-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-slate-900">{t.filters}</h3>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label={t.minPrice}><Inp type="number" value={filters.minPrice ?? ''} onChange={(v) => set({ minPrice: num(v) })} /></Field>
              <Field label={t.maxPrice}><Inp type="number" value={filters.maxPrice ?? ''} onChange={(v) => set({ maxPrice: num(v) })} /></Field>
              <Field label={t.fromDate}><Inp type="date" value={filters.from ?? ''} onChange={(v) => set({ from: v || undefined })} /></Field>
              <Field label={t.toDate}><Inp type="date" value={filters.to ?? ''} onChange={(v) => set({ to: v || undefined })} /></Field>
              <Field label={t.surfaceMin}><Inp type="number" value={filters.minSurface ?? ''} onChange={(v) => set({ minSurface: num(v) })} /></Field>
              <Field label={t.surfaceMax}><Inp type="number" value={filters.maxSurface ?? ''} onChange={(v) => set({ maxSurface: num(v) })} /></Field>
              <Field label={t.landMin}><Inp type="number" value={filters.minLand ?? ''} onChange={(v) => set({ minLand: num(v) })} /></Field>
              <Field label={t.landMax}><Inp type="number" value={filters.maxLand ?? ''} onChange={(v) => set({ maxLand: num(v) })} /></Field>
              <Field label="DPE">
                <select value={filters.dpe ?? ''} onChange={(e) => set({ dpe: e.target.value || undefined })}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-brand-400">
                  <option value="">{t.anyDpe}</option>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => <option key={c} value={c}>DPE {c}</option>)}
                </select>
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <button onClick={() => onChange({ type: filters.type })} className="text-sm font-medium text-slate-500 hover:text-slate-800">{t.reset}</button>
              <button onClick={() => setOpen(false)} className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700">{t.apply}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Inp({ type, value, onChange }: { type: string; value: string | number; onChange: (v: string) => void }) {
  return (
    <input
      type={type}
      inputMode={type === 'number' ? 'numeric' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
    />
  );
}
