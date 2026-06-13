'use client';

import { useEffect, useState } from 'react';
import { getStats, getStatsExplore, StatsExplore } from '@/lib/api';
import { StatsData, TopCommune } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { SearchBar } from '@/components/SearchBar';
import { usePageTitle } from '@/lib/useTitle';
import { useBrandColor } from '@/lib/useBrandColor';
import { AreaChart, BarChart, Donut, RadialWheel, Pyramid } from '@/components/Charts';

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const REGIONS: { code: string; nom: string }[] = [
  { code: '84', nom: 'Auvergne-Rhône-Alpes' }, { code: '27', nom: 'Bourgogne-Franche-Comté' },
  { code: '53', nom: 'Bretagne' }, { code: '24', nom: 'Centre-Val de Loire' }, { code: '94', nom: 'Corse' },
  { code: '44', nom: 'Grand Est' }, { code: '32', nom: 'Hauts-de-France' }, { code: '11', nom: 'Île-de-France' },
  { code: '28', nom: 'Normandie' }, { code: '75', nom: 'Nouvelle-Aquitaine' }, { code: '76', nom: 'Occitanie' },
  { code: '52', nom: 'Pays de la Loire' }, { code: '93', nom: "Provence-Alpes-Côte d'Azur" },
];

export default function StatsPage() {
  const { t, locale } = useI18n();
  usePageTitle(t.navStats);
  const brand = useBrandColor();
  const [d, setD] = useState<StatsData | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [region, setRegion] = useState('');
  const [dept, setDept] = useState('');
  const [commune, setCommune] = useState<{ code: string; nom: string } | null>(null);
  const [exp, setExp] = useState<StatsExplore | null>(null);
  const [depts, setDepts] = useState<{ code: string; nom: string }[]>([]);
  const filtered = year != null || !!region || !!dept || !!commune;

  useEffect(() => { getStats().then(setD).catch(() => {}); }, []);
  useEffect(() => {
    fetch('https://geo.api.gouv.fr/departements?fields=nom,code').then((r) => (r.ok ? r.json() : []))
      .then((x) => setDepts(Array.isArray(x) ? x : [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!filtered) { setExp(null); return; }
    let off = false;
    getStatsExplore({ year: year ?? undefined, region: region || undefined, dept: dept || undefined, commune: commune?.code })
      .then((r) => !off && setExp(r)).catch(() => !off && setExp(null));
    return () => { off = true; };
  }, [year, region, dept, commune, filtered]);

  const reset = () => { setYear(null); setRegion(''); setDept(''); setCommune(null); };

  const nf = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB');
  const big = (v: number) => new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
  }).format(v);
  const months = locale === 'fr' ? MONTHS_FR : MONTHS_EN;

  // Active chart datasets: explore (when filtered) overrides national.
  const byYear = exp?.byYear ?? d?.byYear ?? [];
  const byType = exp?.byType ?? d?.byType ?? [];
  const byMonth = exp?.byMonth ?? d?.byMonth ?? [];
  const priceBands = exp?.priceBands ?? d?.priceBands ?? [];
  const byDept = exp?.byDept ?? d?.byDept ?? [];
  const maxType = Math.max(1, ...byType.map((x) => x.ventes));
  const scopeYears = (d?.byYear ?? []).map((y) => y.annee);
  const YEARS = scopeYears.length ? scopeYears : Array.from({ length: 12 }, (_, i) => 2014 + i);
  const scopeLabel = (commune?.nom
    || (dept && (depts.find((x) => x.code === dept)?.nom ?? dept))
    || (region && (REGIONS.find((x) => x.code === region)?.nom ?? region))
    || 'France') + (year ? ` · ${year}` : '');

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SubNav active="stats" />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.statsTitle}</h1>

        {/* Filter bar */}
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <Fld label={t.statsFltYear}>
            <select value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
              <option value="">{t.statsAll}</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Fld>
          <Fld label={t.statsFltRegion}>
            <select value={region} onChange={(e) => { setRegion(e.target.value); setDept(''); setCommune(null); }} className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
              <option value="">{t.statsAll}</option>
              {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.nom}</option>)}
            </select>
          </Fld>
          <Fld label={t.statsFltDept}>
            <select value={dept} onChange={(e) => { setDept(e.target.value); setCommune(null); }} className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
              <option value="">{t.statsAll}</option>
              {depts.map((dp) => <option key={dp.code} value={dp.code}>{dp.code} · {dp.nom}</option>)}
            </select>
          </Fld>
          <Fld label={t.statsFltCity}>
            <div className="w-52"><SearchBar onLocate={(s) => setCommune(s.citycode ? { code: s.citycode, nom: s.city || s.label } : null)} /></div>
          </Fld>
          {filtered && (
            <button onClick={reset} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">{t.reset}</button>
          )}
          <span className="ml-auto self-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{scopeLabel}</span>
        </div>

        {!d ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-white" />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-white" />)}
            </div>
          </div>
        ) : (
        <>
        {/* Totals */}
        {d?.totals && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t.kTotalSales} value={nf.format(exp?.totals.ventes ?? d.totals.ventes)} />
            <Stat label={t.kTotalVolume} value={big(exp?.totals.volume ?? d.totals.volume)} />
            {filtered
              ? <Stat label={t.statsScope} value={scopeLabel} />
              : <Stat label={t.kCommunes} value={nf.format(d.totals.communes)} />}
            <Stat label="2014 → 2025" value={`${(d.totals.min_date || '').slice(0, 4)}–${(d.totals.max_date || '').slice(0, 4)}`} />
          </div>
        )}

        {/* Price trend + volume by year */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.priceTrendTitle}>
            <AreaChart data={byYear.map((y) => ({ label: String(y.annee), value: y.median_m2 }))} unit=" €" color={brand} />
          </Card>
          <Card title={`${t.volumeByYearTitle} · ${t.statsClickYear}`}>
            <BarChart data={byYear.map((y) => ({ label: String(y.annee), value: y.volume }))} color={brand}
              selected={year != null ? String(year) : undefined}
              onSelect={(lbl) => setYear(year === Number(lbl) ? null : Number(lbl))} />
          </Card>
        </div>

        {/* Donut share + price-band pyramid */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.salesShareTitle}>
            <Donut data={byType.map((x) => ({ label: (t as any)[x.type] ?? x.type, value: x.ventes }))} />
          </Card>
          <Card title={t.priceBandsTitle}>
            <Pyramid data={priceBands.map((b) => ({ label: b.label, value: b.ventes }))} />
          </Card>
        </div>

        {/* Radial wheel of departments + seasonality */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.topDeptsTitle}>
            <RadialWheel data={byDept.slice(0, 12).map((x) => ({ label: x.dept, value: x.ventes }))} />
          </Card>
          <Card title={t.seasonalityTitle}>
            <BarChart data={byMonth.map((m) => ({ label: months[m.mois - 1] ?? String(m.mois), value: m.ventes }))} color="#6366f1" />
          </Card>
        </div>

        {/* Affordability + liquidity (national only) */}
        {!filtered && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.affordTitle}>
            <div className="grid grid-cols-2 gap-4">
              <RankList label={t.affordBest} rows={(d?.affordability?.best ?? []).map((r) => ({ code: r.code_commune, name: r.nom_commune, dep: r.code_departement, val: `${r.years} ${t.yearsUnit}` }))} />
              <RankList label={t.affordWorst} rows={(d?.affordability?.worst ?? []).map((r) => ({ code: r.code_commune, name: r.nom_commune, dep: r.code_departement, val: `${r.years} ${t.yearsUnit}` }))} />
            </div>
          </Card>
          <Card title={t.liquidityTitle}>
            {d?.liquidity?.national_median != null && (
              <div className="mb-3 text-xs text-slate-500">{t.nationalMedian}: <span className="font-semibold text-slate-800">{d.liquidity.national_median} {t.daysUnit}</span></div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <RankList label={t.liquidFast} rows={(d?.liquidity?.fastest ?? []).map((r) => ({ code: r.code_commune, name: r.nom_commune, dep: r.code_departement, val: `${r.days} ${t.daysUnit}` }))} />
              <RankList label={t.liquidSlow} rows={(d?.liquidity?.slowest ?? []).map((r) => ({ code: r.code_commune, name: r.nom_commune, dep: r.code_departement, val: `${r.days} ${t.daysUnit}` }))} />
            </div>
          </Card>
        </div>
        )}

        {/* By type + by dept */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title={t.byTypeTitle}>
            {byType.map((x) => (
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
                  {byDept.map((x) => (
                    <tr key={x.dept} onClick={() => setDept(dept === x.dept ? '' : x.dept)}
                      className={`cursor-pointer hover:bg-slate-50 ${dept === x.dept ? 'bg-brand-50' : ''}`}>
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

        {/* Top 10s (national only) */}
        {!filtered && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <TopList title={t.topSalesTitle} rows={d?.topSales ?? []} render={(r) => nf.format(r.ventes_total ?? 0)} locale={locale} />
          <TopList title={t.topVolumeTitle} rows={d?.topVolume ?? []} render={(r) => big(r.volume_total ?? 0)} locale={locale} />
          <TopList title={t.topTurnoverTitle} rows={d?.topTurnover ?? []} render={(r) => nf.format(r.resales ?? 0)} locale={locale} />
        </div>
        )}
        </>
        )}
      </main>
    </div>
  );
}

function RankList({ label, rows }: { label: string; rows: { code: string; name: string; dep: string; val: string }[] }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <ol className="space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.code}>
            <a href={`/commune/${r.code}`} className="flex items-center justify-between rounded-lg px-1.5 py-1 hover:bg-slate-50">
              <span className="min-w-0 truncate"><span className="mr-1.5 text-slate-400">{i + 1}.</span>{r.name}</span>
              <span className="shrink-0 pl-2 font-semibold tabular-nums text-slate-800">{r.val}</span>
            </a>
          </li>
        ))}
        {rows.length === 0 && <li className="px-1.5 text-slate-300">—</li>}
      </ol>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
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
