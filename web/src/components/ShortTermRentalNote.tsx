'use client';

import { useI18n } from '@/lib/i18n';
import { shortTermRule } from '@/lib/strRules';

// "Location courte durée (Airbnb)" regulatory note for a commune.
export function ShortTermRentalNote({ code, population }: { code?: string | null; population?: number | null }) {
  const { t } = useI18n();
  if (!code) return null;
  const { strict, dayCap } = shortTermRule(code, population);

  return (
    <section className={`report-card rounded-2xl border p-4 ${strict ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: strict ? '#f59e0b' : '#10b981' }} />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.strTitle}</h2>
      </div>
      {strict && <p className="mt-2 text-sm font-medium text-amber-800">{t.strStrict}</p>}
      <p className={`mt-1 text-sm ${strict ? 'text-amber-700' : 'text-slate-600'}`}>
        {t.strBaseline.replace('{cap}', String(dayCap))}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{t.strNote}</p>
    </section>
  );
}
