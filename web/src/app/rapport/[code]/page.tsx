'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCommune, getTrend } from '@/lib/api';
import { CommuneProfile, YearTrend } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ScoreDial } from '@/components/ScoreDial';
import { TrendChart } from '@/components/TrendChart';

const ENERGY_COLORS: Record<string, string> = {
  A: '#319a3b', B: '#5fb84f', C: '#a8d04a', D: '#fde64b', E: '#fbb33d', F: '#ee732f', G: '#e30613',
};
const ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export default function ReportPage() {
  const { t, locale } = useI18n();
  const code = String(useParams().code);
  const [data, setData] = useState<CommuneProfile | null>(null);
  const [trend, setTrend] = useState<YearTrend[]>([]);
  const [brand, setBrand] = useState('Bloominder');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const b = new URLSearchParams(window.location.search).get('brand');
    if (b) setBrand(b);
  }, []);

  useEffect(() => {
    let off = false;
    setLoading(true);
    getCommune(code).then((d) => !off && setData(d)).catch(() => !off && setData(null)).finally(() => !off && setLoading(false));
    getTrend(code).then((tr) => !off && setTrend(tr)).catch(() => {});
    return () => { off = true; };
  }, [code]);

  const m = data?.metrics;
  const s = data?.scores;
  const vv = (data?.valeur_verte ?? []).filter((x) => x.median_eur_m2 != null).sort((a, b) => ORDER.indexOf(a.classe) - ORDER.indexOf(b.classe));
  const vvMax = Math.max(1, ...vv.map((x) => x.median_eur_m2 as number));
  const today = new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB');

  return (
    <div className="min-h-[100dvh] bg-slate-100 py-6">
      {/* Toolbar (not printed) */}
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center gap-3 px-4">
        <a href={`/commune/${code}`} className="text-sm font-medium text-slate-500 hover:text-brand-700">← {t.profileBack}</a>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-slate-500">{t.brandLabel}:</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)}
            className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 outline-none focus:border-brand-400" />
        </label>
        <button onClick={() => window.print()} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {t.printPdf}
        </button>
      </div>

      {loading || !data || !m ? (
        <div className="mx-auto max-w-3xl px-4 text-slate-400">{loading ? '…' : t.notFound}</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 px-4">
          {/* Cover header */}
          <div className="report-card rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold tracking-tight text-brand-700">{brand}</div>
              <div className="text-xs text-slate-400">{t.generatedOn} {today}</div>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{m.nom_commune}</h1>
            <p className="text-sm text-slate-500">{t.reportTitle} · {m.code_departement} · INSEE {m.code_commune}</p>
            <div className="mt-5 flex flex-wrap items-center justify-around gap-4">
              <ScoreDial value={s?.score_global ?? null} label={t.scoreGlobalLbl} size={104} />
              <ScoreDial value={s?.score_yield ?? null} label={t.scoreYieldLbl} />
              <ScoreDial value={s?.score_growth ?? null} label={t.scoreGrowthLbl} />
              <ScoreDial value={s?.score_demand ?? null} label={t.scoreDemandLbl} />
            </div>
          </div>

          {/* Market */}
          <Card title={t.secMarketR}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={t.kpiPriceAppt} value={m.median_prix_m2_appartement ? formatEUR(m.median_prix_m2_appartement, locale) : '—'} />
              <Kpi label={t.kpiPriceMaison} value={m.median_prix_m2_maison ? formatEUR(m.median_prix_m2_maison, locale) : '—'} />
              <Kpi label={t.kpiGrowth} value={m.prix_m2_growth_3y != null ? `${m.prix_m2_growth_3y > 0 ? '+' : ''}${m.prix_m2_growth_3y}%` : '—'} />
              <Kpi label={t.kpiSales12m} value={m.ventes_12m != null ? String(m.ventes_12m) : '—'} />
            </div>
            {trend.length >= 2 && <div className="mt-4 rounded-xl border border-slate-100 p-3"><TrendChart data={trend} /></div>}
          </Card>

          {/* Rental yield + short-let */}
          <Card title={t.secRentalR}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={t.kpiRent} value={m.loyer_m2_appartement != null ? `${m.loyer_m2_appartement} €` : '—'} />
              <Kpi label={t.kpiYield} value={m.rendement_brut_appartement != null ? `${m.rendement_brut_appartement}%` : '—'} accent />
              {data.resale?.median_gain_pct != null && <Kpi label={t.colResale} value={`+${data.resale.median_gain_pct}%`} />}
              {data.airbnb?.median_nightly != null && <Kpi label={`Airbnb ${t.slNightly}`} value={formatEUR(data.airbnb.median_nightly, locale)} />}
            </div>
            {data.airbnb && data.airbnb.listings > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {t.shortLet}: {data.airbnb.listings} {t.slListings.toLowerCase()} · {t.slOccupancy} {data.airbnb.median_occupancy ?? '—'}% · {t.slRevenue} {data.airbnb.median_revenue_year != null ? formatEUR(data.airbnb.median_revenue_year, locale) : '—'}
              </p>
            )}
          </Card>

          {/* Energy */}
          {vv.length > 0 && (
            <Card title={t.energyTitle}>
              <p className="mb-2 text-xs text-slate-500">
                {data.dpe?.pct_passoire != null && <>{t.passoireLbl}: <b className="text-rose-600">{data.dpe.pct_passoire}%</b> · </>}
                {t.valeurVerteLbl}
              </p>
              <div className="flex items-end gap-2" style={{ height: 130 }}>
                {vv.map((x) => (
                  <div key={x.classe} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-500">{formatEUR(x.median_eur_m2, locale)}</span>
                    <div className="w-full rounded-t" style={{ height: `${((x.median_eur_m2 as number) / vvMax) * 95}px`, background: ENERGY_COLORS[x.classe] }} />
                    <span className="text-xs font-bold" style={{ color: ENERGY_COLORS[x.classe] }}>{x.classe}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Demographics & taxes */}
          <Card title={t.secDemoFisc}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi label={t.kpiPopulation} value={data.demo?.population != null ? data.demo.population.toLocaleString('fr-FR') : '—'} />
              <Kpi label={t.kpiTax} value={data.tax?.taux_tfb != null ? `${data.tax.taux_tfb}%` : '—'} />
              <Kpi label={t.colVentes} value={m.ventes_total.toLocaleString('fr-FR')} />
            </div>
          </Card>

          <p className="report-card px-2 text-[10px] leading-snug text-slate-400">{t.reportDisclaimer}</p>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-card rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
      <div className={`text-lg font-bold ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
