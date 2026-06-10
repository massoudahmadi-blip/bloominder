'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getScreener } from '@/lib/api';
import { CommuneRow, ScreenerSort } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

function scoreColor(v: number | null): string {
  if (v == null) return '#94a3b8';
  if (v >= 70) return '#10b981';
  if (v >= 45) return '#f59e0b';
  return '#ef4444';
}

function ScoreBadge({ v }: { v: number | null }) {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: scoreColor(v) }}
    >
      {v == null ? '—' : Math.round(v)}
    </span>
  );
}

const pct = (v: number | null, sign = false) =>
  v == null ? '—' : `${sign && v > 0 ? '+' : ''}${v}%`;

export default function ScreenerPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<CommuneRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<ScreenerSort>('score_global');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [dept, setDept] = useState('');
  const [minYield, setMinYield] = useState('');
  const [minScore, setMinScore] = useState('');
  const pageSize = 25;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(() => {
      getScreener({
        sort, dir, page, pageSize,
        dept: dept || undefined,
        minYield: minYield ? Number(minYield) : undefined,
        minScore: minScore ? Number(minScore) : undefined,
      })
        .then((r) => {
          if (cancelled) return;
          setRows(r.results);
          setTotal(r.total);
        })
        .catch(() => !cancelled && setRows([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [sort, dir, page, dept, minYield, minScore]);

  const toggleSort = (col: ScreenerSort) => {
    if (sort === col) setDir(dir === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setDir('desc'); }
    setPage(1);
  };

  const arrow = (col: ScreenerSort) => (sort === col ? (dir === 'desc' ? ' ↓' : ' ↑') : '');

  const Th = ({ col, label, right }: { col: ScreenerSort; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-brand-700 ${right ? 'text-right' : 'text-left'}`}
    >
      {label}{arrow(col)}
    </th>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Bloominder</span>
        </a>
        <nav className="flex items-center gap-1 text-sm">
          <a href="/" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.mapTab}</a>
          <a href="/screener" className="rounded-lg px-3 py-1.5 font-medium text-brand-700">{t.markets}</a>
          <a href="/calculateur" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.calculator}</a>
        </nav>
        <div className="ml-auto flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLocale(l)}
              className={`rounded-full px-3 py-1.5 uppercase transition ${locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.screenerTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.screenerSubtitle}</p>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label={t.filterDept}>
            <input value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}
              placeholder="13" className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterMinYield}>
            <input type="number" value={minYield} onChange={(e) => { setMinYield(e.target.value); setPage(1); }}
              className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterMinScore}>
            <input type="number" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
              className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <Th col="score_global" label={t.colScore} />
                <th className="px-3 py-2 text-left font-medium">{t.colCommune}</th>
                <Th col="median_prix_m2" label={t.colPriceM2} right />
                <Th col="prix_m2_growth_3y" label={t.colGrowth} right />
                <th className="px-3 py-2 text-right font-medium">{t.colRent}</th>
                <Th col="rendement_brut_appartement" label={t.colYield} right />
                <th className="px-3 py-2 text-right font-medium">{t.colResale}</th>
                <th className="px-3 py-2 text-right font-medium">{t.colTax}</th>
                <th className="px-3 py-2 text-right font-medium">{t.colAirbnb}</th>
                <th className="px-3 py-2 text-right font-medium">{t.colPassoire}</th>
                <Th col="ventes_total" label={t.colVentes} right />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && rows.length === 0 ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-3 py-3"><div className="h-6 animate-pulse rounded bg-slate-100" /></td></tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{t.noResults}</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.code_commune}
                    onClick={() => router.push(`/commune/${r.code_commune}`)}
                    className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2"><ScoreBadge v={r.score_global} /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{r.nom_commune}</div>
                      <div className="text-xs text-slate-400">{r.code_departement}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.median_prix_m2 ? formatEUR(r.median_prix_m2, locale) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.prix_m2_growth_3y != null && r.prix_m2_growth_3y < 0 ? '#ef4444' : '#10b981' }}>{pct(r.prix_m2_growth_3y, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.loyer_m2_appartement != null ? `${r.loyer_m2_appartement} €` : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{pct(r.rendement_brut_appartement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{pct(r.resale_gain, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(r.taxe_fonciere)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.airbnb_nightly != null ? formatEUR(r.airbnb_nightly, locale) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct(r.pct_passoire)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.ventes_total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t.prev}</button>
            <span className="text-slate-400">{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
            <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t.next}</button>
          </div>
        )}

        <p className="mt-4 text-[11px] text-slate-300">{t.dataSource}</p>
      </main>
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
