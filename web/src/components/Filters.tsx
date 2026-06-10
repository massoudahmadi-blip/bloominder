'use client';

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

  const setType = (type: PropertyType | 'all') => onChange({ ...filters, type });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setType(opt)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filters.type === opt
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {opt === 'all' ? t.allTypes : (t as any)[opt]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          placeholder={t.minPrice}
          value={filters.minPrice ?? ''}
          onChange={(e) => onChange({ ...filters, minPrice: e.target.value ? Number(e.target.value) : undefined })}
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <span className="text-slate-300">–</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder={t.maxPrice}
          value={filters.maxPrice ?? ''}
          onChange={(e) => onChange({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })}
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <input type="date" title={t.fromDate} value={filters.from ?? ''}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400" />
        <span className="text-slate-300">–</span>
        <input type="date" title={t.toDate} value={filters.to ?? ''}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400" />
      </div>

      {/* Surface habitable */}
      <div className="flex items-center gap-1.5">
        <input type="number" inputMode="numeric" placeholder={t.surfaceMin} value={filters.minSurface ?? ''}
          onChange={(e) => onChange({ ...filters, minSurface: e.target.value ? Number(e.target.value) : undefined })}
          className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        <span className="text-slate-300">–</span>
        <input type="number" inputMode="numeric" placeholder={t.surfaceMax} value={filters.maxSurface ?? ''}
          onChange={(e) => onChange({ ...filters, maxSurface: e.target.value ? Number(e.target.value) : undefined })}
          className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
      </div>

      {/* Land size */}
      <div className="flex items-center gap-1.5">
        <input type="number" inputMode="numeric" placeholder={t.landMin} value={filters.minLand ?? ''}
          onChange={(e) => onChange({ ...filters, minLand: e.target.value ? Number(e.target.value) : undefined })}
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        <span className="text-slate-300">–</span>
        <input type="number" inputMode="numeric" placeholder={t.landMax} value={filters.maxLand ?? ''}
          onChange={(e) => onChange({ ...filters, maxLand: e.target.value ? Number(e.target.value) : undefined })}
          className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
      </div>

      {/* DPE class */}
      <select value={filters.dpe ?? ''}
        onChange={(e) => onChange({ ...filters, dpe: e.target.value || undefined })}
        className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-brand-400">
        <option value="">{t.anyDpe}</option>
        {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => <option key={c} value={c}>DPE {c}</option>)}
      </select>

      {(filters.type !== 'all' || filters.minPrice != null || filters.maxPrice != null || filters.from || filters.to ||
        filters.minSurface != null || filters.maxSurface != null || filters.minLand != null || filters.maxLand != null || filters.dpe) && (
        <button
          onClick={() => onChange({ type: 'all' })}
          className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-700"
        >
          {t.reset}
        </button>
      )}
    </div>
  );
}
