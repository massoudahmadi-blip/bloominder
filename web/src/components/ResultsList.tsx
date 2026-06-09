'use client';

import { Sale } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { ResultCard } from './ResultCard';

export function ResultsList({
  sales,
  loading,
  selectedId,
  onSelect,
}: {
  sales: Sale[];
  loading: boolean;
  selectedId: string | number | null;
  onSelect: (s: Sale) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-700">
          {loading ? (
            <span className="inline-block h-4 w-24 animate-pulse rounded bg-slate-200" />
          ) : (
            <>
              <span className="text-base font-bold text-slate-900">{sales.length.toLocaleString('fr-FR')}</span>{' '}
              {t.results}
            </>
          )}
        </h2>
      </div>

      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 pb-6 sm:px-5">
        {loading && sales.length === 0 ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))
        ) : sales.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-medium text-slate-700">{t.noResults}</p>
            <p className="mt-1 text-sm text-slate-400">{t.noResultsHint}</p>
          </div>
        ) : (
          sales.map((s) => (
            <ResultCard key={s.id} sale={s} active={s.id === selectedId} onClick={() => onSelect(s)} />
          ))
        )}
      </div>
    </div>
  );
}
