'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sale, YearTrend } from '@/lib/types';
import { getComparables, getTrend, getParcelHistory, getMutation, Mutation } from '@/lib/api';
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
  const router = useRouter();
  const [comps, setComps] = useState<Sale[]>([]);
  const [trend, setTrend] = useState<YearTrend[]>([]);
  const [history, setHistory] = useState<Sale[]>([]);
  const [mutation, setMutation] = useState<Mutation | null>(null);

  useEffect(() => {
    if (!sale) return;
    setComps([]);
    setTrend([]);
    setHistory([]);
    setMutation(null);
    getComparables(sale.latitude, sale.longitude, sale.type).then(setComps).catch(() => {});
    getTrend(sale.code_commune, sale.type).then(setTrend).catch(() => {});
    if (sale.id_parcelle) getParcelHistory(sale.id_parcelle).then(setHistory).catch(() => {});
    if (sale.code_commune && sale.date) getMutation(sale.code_commune, sale.date, sale.prix).then(setMutation).catch(() => {});
  }, [sale]);

  if (!sale) return null;

  const surface = sale.surface_carrez ?? sale.surface_bati ?? null;
  const compM2 = median(comps.map((c) => c.prix_m2).filter((v): v is number => v != null));
  const estimate =
    surface && compM2 ? Math.round((compM2 * surface) / 1000) * 1000 : null;
  // Where this sale sits vs the local €/m² (over/under the comparables median).
  const vsLocal = sale.prix_m2 != null && compM2 ? Math.round(((sale.prix_m2 - compM2) / compM2) * 100) : null;

  const analyze = () => {
    const p = new URLSearchParams();
    p.set('lat', String(sale.latitude));
    p.set('lon', String(sale.longitude));
    const label = [sale.adresse, sale.nom_commune].filter(Boolean).join(', ');
    if (label) p.set('label', label);
    if (sale.code_commune) p.set('citycode', sale.code_commune);
    if (surface) p.set('surface', String(Math.round(surface)));
    if (sale.surface_terrain) p.set('terrain', String(Math.round(sale.surface_terrain)));
    if (sale.type) p.set('type', sale.type);
    if (sale.prix) p.set('prix', String(sale.prix));
    if (sale.prix_m2 != null) p.set('prixm2', String(Math.round(sale.prix_m2)));
    if (sale.date) p.set('date', sale.date);
    if (sale.dpe) p.set('dpe', sale.dpe);
    if (sale.nb_pieces != null) p.set('pieces', String(sale.nb_pieces));
    router.push(`/adresse?${p.toString()}`);
  };

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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sale.resale_pct != null && (
                <span className="inline-block rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  {t.resold} {sale.resale_pct > 0 ? '+' : ''}{sale.resale_pct}%
                  {sale.resale_prev_date ? ` · ${new Date(sale.resale_prev_date).getFullYear()}` : ''}
                </span>
              )}
              {vsLocal != null && (
                <span
                  className="inline-block rounded-md px-2 py-1 text-xs font-semibold"
                  style={{
                    background: vsLocal > 10 ? '#fef2f2' : vsLocal < -10 ? '#ecfdf5' : '#f1f5f9',
                    color: vsLocal > 10 ? '#b91c1c' : vsLocal < -10 ? '#047857' : '#475569',
                  }}
                >
                  {vsLocal > 0 ? '+' : ''}{vsLocal}% {t.vsLocal}
                </span>
              )}
            </div>
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
            <Fact label={sale.surface_carrez != null ? `${t.surface} (Carrez)` : t.surface} value={formatM2(surface)} />
            <Fact label={t.rooms} value={sale.nb_pieces != null ? String(sale.nb_pieces) : '—'} />
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
              <div className="flex h-[22px] items-center justify-center"><EnergyBadge classe={sale.dpe} /></div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">DPE</div>
            </div>
          </div>

          {/* Cadastral parcel */}
          {(sale.id_parcelle || sale.nombre_lots) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              {sale.id_parcelle && <span>{t.parcelLabel}: <b className="font-mono text-slate-700">{sale.id_parcelle}</b></span>}
              {sale.nombre_lots ? <span>{sale.nombre_lots} {t.lotsLabel}</span> : null}
              {(sale.geo_precision === 'commune' || sale.geo_precision === 'locality') && <span className="text-amber-600">{t.precApprox}</span>}
            </div>
          )}

          {/* What the sale bundled (full mutation composition) */}
          {mutation && (mutation.composition.length > 1 || mutation.n_lines > 1 || mutation.surface_terrain_total > 0) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.mutationTitle}</h3>
              <div className="rounded-2xl border border-slate-100 p-3">
                <ul className="space-y-1.5">
                  {mutation.composition.map((c) => {
                    const hab = c.surface_carrez > 0 ? c.surface_carrez : c.surface_bati;
                    const detail = (c.type === 'Terrain')
                      ? (c.surface_terrain > 0 ? formatM2(c.surface_terrain) : '')
                      : (hab > 0 ? formatM2(hab) : '');
                    return (
                      <li key={c.type} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">
                          {c.count > 1 && <span className="text-slate-400">{c.count}× </span>}
                          {(t as any)[c.type] ?? c.type}
                        </span>
                        <span className="tabular-nums text-slate-500">{detail || '—'}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                  <span>{mutation.parcels.length} {mutation.parcels.length > 1 ? t.parcellesLabel : t.parcelLabel}</span>
                  {mutation.prix_m2 != null && <span>{formatPriceM2(mutation.prix_m2, locale)} ({t.surface})</span>}
                  <span className="font-semibold text-slate-700">{formatEUR(mutation.valeur, locale)}</span>
                </div>
                {mutation.parcels.length > 0 && (
                  <div className="mt-1.5 truncate font-mono text-[10px] text-slate-400">{mutation.parcels.join(' · ')}</div>
                )}
              </div>
            </section>
          )}

          {/* Sale */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.saleHistory}</h3>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">{t.soldOn}</span>
              <span className="font-medium text-slate-800">{formatDate(sale.date, locale)}</span>
            </div>
            {sale.surface_terrain != null && (
              <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-slate-500">{t.land}</span>
                <span className="font-medium text-slate-800">{formatM2(sale.surface_terrain)}</span>
              </div>
            )}
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

          {/* This parcel's full sale history (exact property, any date) */}
          {history.length > 1 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.parcelHistoryTitle}</h3>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800">{formatDate(h.date, locale)}</div>
                      <div className="text-xs text-slate-400">
                        {h.type ? `${(t as any)[h.type] ?? h.type} · ` : ''}{h.prix_m2 != null ? formatPriceM2(h.prix_m2, locale) : '—'}
                      </div>
                    </div>
                    <div className="shrink-0 pl-3 font-semibold text-slate-700">{formatEUR(h.prix, locale)}</div>
                  </li>
                ))}
              </ul>
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

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <button
            onClick={analyze}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 17l5-5 4 4 8-8M21 8h-4M21 8v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.analyzeAddress}
          </button>
          {sale.code_commune && (
            <button
              onClick={() => router.push(`/commune/${sale.code_commune}`)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {t.viewCity}
            </button>
          )}
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
