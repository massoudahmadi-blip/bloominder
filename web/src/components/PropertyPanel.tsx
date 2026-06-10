'use client';

import { useEffect, useState } from 'react';
import { Sale, YearTrend } from '@/lib/types';
import { getComparables, getTrend } from '@/lib/api';
import { formatEUR, formatPriceM2, formatM2, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { TrendChart } from './TrendChart';
import { EnergyBadge } from './EnergyBadge';

function median(nums: number[]): number | null {
  const a = nums.filter((n) => n != null).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.floor(a.length / 2)];
}

export function PropertyPanel({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [comps, setComps] = useState<Sale[]>([]);
  const [trend, setTrend] = useState<YearTrend[]>([]);

  useEffect(() => {
    if (!sale) return;
    setComps([]);
    setTrend([]);
    getComparables(sale.latitude, sale.longitude, sale.type).then(setComps).catch(() => {});
    getTrend(sale.code_commune, sale.type).then(setTrend).catch(() => {});
  }, [sale]);

  if (!sale) return null;

  const compM2 = median(comps.map((c) => c.prix_m2).filter((v): v is number => v != null));
  const estimate =
    sale.surface_bati && compM2 ? Math.round((compM2 * sale.surface_bati) / 1000) * 1000 : null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={onClose} />

      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md animate-slideIn flex-col bg-white shadow-panel lg:absolute">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-2xl font-bold tracking-tight text-slate-900">{formatEUR(sale.prix, locale)}</div>
            <div className="mt-0.5 truncate text-sm text-slate-500">
              {sale.adresse ? `${sale.adresse}, ` : ''}
              {sale.code_postal} {sale.nom_commune}
            </div>
            {sale.resale_pct != null && (
              <div className="mt-2 inline-block rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                {t.resold} {sale.resale_pct > 0 ? '+' : ''}{sale.resale_pct}%
                {sale.resale_prev_date ? ` · ${new Date(sale.resale_prev_date).getFullYear()}` : ''}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Key facts */}
          <div className="grid grid-cols-4 gap-2">
            <Fact label={t.pricePerM2} value={formatPriceM2(sale.prix_m2, locale)} />
            <Fact label={t.surface} value={formatM2(sale.surface_bati)} />
            <Fact label={t.rooms} value={sale.nb_pieces != null ? String(sale.nb_pieces) : '—'} />
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
              <div className="flex h-[22px] items-center justify-center"><EnergyBadge classe={sale.dpe} /></div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">DPE</div>
            </div>
          </div>

          {/* Sale */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.saleHistory}</h3>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">{t.soldOn}</span>
              <span className="font-medium text-slate-800">{formatDate(sale.date, locale)}</span>
            </div>
          </section>

          {/* Estimate */}
          {estimate && (
            <section className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 3v18h18" strokeLinecap="round" />
                  <path d="m7 14 3-3 3 3 4-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t.estimate}
              </div>
              <div className="mt-1 text-xs text-slate-500">{t.estimateValue}</div>
              <div className="mt-1 text-2xl font-bold text-brand-800">
                {formatEUR(Math.round((estimate * 0.92) / 1000) * 1000, locale)} –{' '}
                {formatEUR(Math.round((estimate * 1.08) / 1000) * 1000, locale)}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">{t.estimateNote}</p>
            </section>
          )}

          {/* Trend */}
          {trend.length >= 2 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.trend}</h3>
              <div className="rounded-2xl border border-slate-100 p-3">
                <TrendChart data={trend} />
              </div>
            </section>
          )}

          {/* Comparables */}
          {comps.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.comparables}</h3>
              <ul className="space-y-2">
                {comps.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{c.adresse ?? c.nom_commune}</div>
                      <div className="text-xs text-slate-400">
                        {formatDate(c.date, locale)} · {formatPriceM2(c.prix_m2, locale)}
                      </div>
                    </div>
                    <div className="shrink-0 pl-3 font-semibold text-slate-700">{formatEUR(c.prix, locale)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="pt-2 text-[11px] text-slate-300">{t.dataSource}</p>
        </div>
      </aside>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="text-sm font-semibold text-slate-800">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
