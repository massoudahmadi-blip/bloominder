'use client';

import { useEffect, useState } from 'react';
import { getStats } from '@/lib/api';
import { StatsData, TopCommune } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export default function StatsPage() {
  const { t, locale, setLocale } = useI18n();
  const [d, setD] = useState<StatsData | null>(null);

  useEffect(() => { getStats().then(setD).catch(() => {}); }, []);

  const nf = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB');
  const big = (v: number) => new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(v);
  const maxType = Math.max(1, ...(d?.byType ?? []).map((x) => x.ventes));

  return (
    <div className="min-h-[100dvh] bg-stone-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" /></svg>
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">Bloominder</span>
        </a>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <a href="/" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.mapTab}</a>
          <a href="/screener" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.markets}</a>
          <a href="/stats" className="rounded-lg px-3 py-1.5 font-medium text-brand-700">{t.navStats}</a>
          <a href="/calculateur" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.calculator}</a>
          <a href="/estimation" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.navEstimate}</a>
        </nav>
        <div className="ml-auto flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLocale(l)} className={`rounded-full px-3 py-1.5 uppercase transition ${locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.statsTitle}</h1>

        {/* Totals */}
        {d?.totals && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t.kTotalSales} value={nf.format(d.totals.ventes)} />
            <Stat label={t.kTotalVolume} value={big(d.totals.volume)} />
            <Stat label={t.kCommunes} value={nf.format(d.totals.communes)} />
            <Stat label="2014 → 2025" value={`${(d.totals.min_date || '').slice(0, 4)}–${(d.totals.max_date || '').slice(0, 4)}`} />
          </div>
        )}

        {/* By type + by dept */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.byTypeTitle}>
            {d?.byType.map((x) => (
              <div key={x.type} className="mb-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">{(t as any)[x.type] ?? x.type}</span>
                  <span className="tabular-nums text-slate-500">{nf.format(x.ventes)}{x.median_m2 ? ` · ${nf.format(x.median_m2)} €/m²` : ''}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-100">
                  <div className="h-2 rounded bg-brand-500" style={{ width: `${(x.ventes / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
          <Card title={t.byDeptTitle}>
            <div className="max-h-72 overflow-y-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-400"><tr>
                  <th className="px-2 py-1 text-left font-medium">{t.colDeptShort}</th>
                  <th className="px-2 py-1 text-right font-medium">{t.kTotalSales}</th>
                  <th className="px-2 py-1 text-right font-medium">{t.colPriceM2}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {d?.byDept.map((x) => (
                    <tr key={x.dept}>
                      <td className="px-2 py-1.5 font-medium text-slate-700">{x.dept}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{nf.format(x.ventes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{x.median_m2 ? `${nf.format(x.median_m2)} €` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Top 10s */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <TopList title={t.topSalesTitle} rows={d?.topSales ?? []} render={(r) => nf.format(r.ventes_total ?? 0)} locale={locale} />
          <TopList title={t.topVolumeTitle} rows={d?.topVolume ?? []} render={(r) => big(r.volume_total ?? 0)} locale={locale} />
          <TopList title={t.topTurnoverTitle} rows={d?.topTurnover ?? []} render={(r) => nf.format(r.resales ?? 0)} locale={locale} />
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function TopList({ title, rows, render, locale }: { title: string; rows: TopCommune[]; render: (r: TopCommune) => string; locale: string }) {
  return (
    <Card title={title}>
      <ol className="space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.code_commune}>
            <a href={`/commune/${r.code_commune}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <span className="min-w-0 truncate"><span className="mr-2 text-slate-400">{i + 1}.</span>{r.nom_commune}<span className="ml-1 text-xs text-slate-400">{r.code_departement}</span></span>
              <span className="shrink-0 pl-2 font-semibold tabular-nums text-slate-800">{render(r)}</span>
            </a>
          </li>
        ))}
      </ol>
    </Card>
  );
}
