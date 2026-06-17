'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getScreener } from '@/lib/api';
import { CommuneRow, ScreenerSort } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';

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
  const { t, locale } = useI18n();
  usePageTitle(t.markets);
  const router = useRouter();
  const [rows, setRows] = useState<CommuneRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<ScreenerSort>('score_global');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [dept, setDept] = useState('');
  const [postal, setPostal] = useState('');
  const [q, setQ] = useState('');
  const [minYield, setMinYield] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxPriceM2, setMaxPriceM2] = useState('');
  const [depts, setDepts] = useState<{ code: string; nom: string }[]>([]);
  const pageSize = 25;

  useEffect(() => {
    fetch('https://geo.api.gouv.fr/departements?fields=nom,code')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setDepts(Array.isArray(d) ? d : []))
      .catch(() => {});
    // Deep-link params: ?dept= (from the choropleth drill-down), ?maxm2= (budget).
    const sp = new URLSearchParams(window.location.search);
    const dp = sp.get('dept'); if (dp) setDept(dp);
    const v = sp.get('maxm2'); if (v) setMaxPriceM2(v);
    const qq = sp.get('q'); if (qq) setQ(qq);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(() => {
      getScreener({
        sort, dir, page, pageSize,
        dept: dept || undefined,
        postal: postal || undefined,
        q: q || undefined,
        minYield: minYield ? Number(minYield) : undefined,
        minScore: minScore ? Number(minScore) : undefined,
        maxPriceM2: maxPriceM2 ? Number(maxPriceM2) : undefined,
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
  }, [sort, dir, page, dept, postal, q, minYield, minScore, maxPriceM2]);

  const exportCsv = () => {
    const head = ['Commune', 'Dept', 'Ventes', 'Prix m2 (12m)', 'Evol 1an %', 'Rendement %', 'Score'];
    const lines = rows.map((r) => [
      r.nom_commune, r.code_departement, r.ventes_total,
      r.median_prix_m2_12m ?? r.median_prix_m2 ?? '', r.prix_m2_growth_1y ?? '',
      r.rendement_brut_appartement ?? '', r.score_global ?? '',
    ].join(';'));
    const csv = '﻿' + [head.join(';'), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `bloominder-marches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const deptName = (c: string) => depts.find((d) => d.code === c)?.nom ?? c;
  const activeFilters: { key: string; label: string; clear: () => void }[] = [
    ...(q ? [{ key: 'q', label: q, clear: () => setQ('') }] : []),
    ...(dept ? [{ key: 'dept', label: `${dept} · ${deptName(dept)}`, clear: () => setDept('') }] : []),
    ...(postal ? [{ key: 'postal', label: `${t.filterPostal} ${postal}`, clear: () => setPostal('') }] : []),
    ...(minYield ? [{ key: 'minYield', label: `${t.filterMinYield} ≥ ${minYield}%`, clear: () => setMinYield('') }] : []),
    ...(minScore ? [{ key: 'minScore', label: `${t.filterMinScore} ≥ ${minScore}`, clear: () => setMinScore('') }] : []),
    ...(maxPriceM2 ? [{ key: 'maxPriceM2', label: `≤ ${Number(maxPriceM2).toLocaleString('fr-FR')} €/m²`, clear: () => setMaxPriceM2('') }] : []),
  ];
  const resetFilters = () => {
    setQ(''); setDept(''); setPostal(''); setMinYield(''); setMinScore(''); setMaxPriceM2(''); setPage(1);
  };

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
    <div className="min-h-[100dvh] bg-canvas">
      <SubNav active="markets" />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.screenerTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.screenerSubtitle}</p>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label={t.filterCity}>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Lyon, Bordeaux…" className="w-44 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterDept}>
            <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }}
              className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
              <option value="">—</option>
              {depts.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.nom}</option>)}
            </select>
          </Field>
          <Field label={t.filterPostal}>
            <input value={postal} onChange={(e) => { setPostal(e.target.value); setPage(1); }}
              placeholder="130…" className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterMinYield}>
            <input type="number" value={minYield} onChange={(e) => { setMinYield(e.target.value); setPage(1); }}
              className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterMinScore}>
            <input type="number" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
              className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
          <Field label={t.filterMaxPriceM2}>
            <input type="number" value={maxPriceM2} onChange={(e) => { setMaxPriceM2(e.target.value); setPage(1); }}
              placeholder="€/m²" className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </Field>
        </div>

        {/* Active filter chips */}
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <button key={f.key} onClick={() => { f.clear(); setPage(1); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100">
                {f.label}
                <span aria-hidden className="text-brand-400">✕</span>
              </button>
            ))}
            <button onClick={resetFilters} className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline">
              {t.resetFilters}
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">{total.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')} {t.screenerResults}</span>
          <button onClick={exportCsv} disabled={!rows.length}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-40">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.exportCsv}
          </button>
        </div>

        {/* Mobile cards */}
        <div className="mt-2 space-y-2 sm:hidden">
          {loading && rows.length === 0
            ? [...Array(6)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />)
            : rows.length === 0
              ? <div className="rounded-2xl border border-slate-200 bg-white px-3 py-10 text-center text-slate-400">{t.noResults}</div>
              : rows.map((r) => (
                <button key={r.code_commune} onClick={() => router.push(`/commune/${r.code_commune}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50">
                  <ScoreBadge v={r.score_global} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-800">{r.nom_commune} <span className="text-xs text-slate-400">{r.code_departement}</span></div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{(r.median_prix_m2_12m ?? r.median_prix_m2) ? formatEUR((r.median_prix_m2_12m ?? r.median_prix_m2) as number, locale) : '—'}/m²</span>
                      <span style={{ color: r.prix_m2_growth_1y != null && r.prix_m2_growth_1y < 0 ? '#ef4444' : '#10b981' }}>{pct(r.prix_m2_growth_1y, true)}</span>
                      <span>{r.rendement_brut_appartement != null ? `${r.rendement_brut_appartement}% ${t.colYield.toLowerCase()}` : '—'}</span>
                    </div>
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
        </div>

        {/* Table (sm+) */}
        <div className="mt-2 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white sm:block">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <Th col="score_global" label={t.colScore} />
                <th className="px-3 py-2 text-left font-medium">{t.colCommune}</th>
                <Th col="median_prix_m2" label={t.colPriceM2} right />
                <Th col="prix_m2_growth_1y" label={t.colGrowth} right />
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
                    <td className="px-3 py-2 text-right tabular-nums">{(r.median_prix_m2_12m ?? r.median_prix_m2) ? formatEUR((r.median_prix_m2_12m ?? r.median_prix_m2) as number, locale) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.prix_m2_growth_1y != null && r.prix_m2_growth_1y < 0 ? '#ef4444' : '#10b981' }}>{pct(r.prix_m2_growth_1y, true)}</td>
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
