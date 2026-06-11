'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCommune, getTrend, getCommuneTransactions } from '@/lib/api';
import { CommuneProfile, YearTrend, Sale } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
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
  const [recent, setRecent] = useState<Sale[]>([]);
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
    getCommuneTransactions(code, 1).then((r) => !off && setRecent(r.results.slice(0, 8))).catch(() => {});
    return () => { off = true; };
  }, [code]);

  const median = (xs: number[]) => { const a = xs.filter((n) => n != null).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };

  const m = data?.metrics;
  const s = data?.scores;
  const vv = (data?.valeur_verte ?? []).filter((x) => x.median_eur_m2 != null).sort((a, b) => ORDER.indexOf(a.classe) - ORDER.indexOf(b.classe));
  const vvMax = Math.max(1, ...vv.map((x) => x.median_eur_m2 as number));
  const today = new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB');

  const clauses: string[] = [];
  if (s) {
    if (s.score_yield != null) clauses.push(s.score_yield >= 66 ? t.narYieldHi : s.score_yield >= 33 ? t.narYieldMid : t.narYieldLo);
    if (s.score_growth != null) clauses.push(s.score_growth >= 50 ? t.narGrowthHi : t.narGrowthLo);
    if (s.score_demand != null) clauses.push(s.score_demand >= 50 ? t.narDemandHi : t.narDemandLo);
  }
  if (data?.dpe?.pct_passoire != null) clauses.push(data.dpe.pct_passoire >= 25 ? t.narPassoireHi : t.narPassoireLo);
  const narrative = clauses.join(' · ');

  const medGood = median(vv.filter((x) => ['A', 'B', 'C'].includes(x.classe)).map((x) => x.median_eur_m2 as number));
  const medBad = median(vv.filter((x) => ['F', 'G'].includes(x.classe)).map((x) => x.median_eur_m2 as number));
  const renoUplift = medGood != null && medBad ? Math.round(((medGood - medBad) / medBad) * 100) : null;
  const peerMax = Math.max(m?.median_prix_m2 ?? 0, data?.benchmark?.dept ?? 0, data?.benchmark?.fr ?? 0, 1);

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

          {/* Investor narrative */}
          {narrative && (
            <div className="report-card rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
              <span className="font-semibold text-brand-800">{m.nom_commune}</span> — {narrative}.
            </div>
          )}

          {/* Market */}
          <Card title={t.secMarketR}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi label={t.kpiPriceAppt} value={m.median_prix_m2_appartement ? formatEUR(m.median_prix_m2_appartement, locale) : '—'} />
              <Kpi label={t.kpiPriceMaison} value={m.median_prix_m2_maison ? formatEUR(m.median_prix_m2_maison, locale) : '—'} />
              <Kpi label={t.kpiGrowth} value={m.prix_m2_growth_3y != null ? `${m.prix_m2_growth_3y > 0 ? '+' : ''}${m.prix_m2_growth_3y}%` : '—'} />
              <Kpi label={t.kpiLiquidity} value={m.median_days_to_sell != null ? `${m.median_days_to_sell} ${t.daysShort}` : '—'} />
              <Kpi label={t.kpiVolatility} value={m.p25_prix_m2 != null && m.p75_prix_m2 != null ? `${formatEUR(m.p25_prix_m2, locale)}–${formatEUR(m.p75_prix_m2, locale)}` : '—'} />
              <Kpi label={t.kpiSales12m} value={m.ventes_12m != null ? String(m.ventes_12m) : '—'} />
            </div>
            {trend.length >= 2 && <div className="mt-4 rounded-xl border border-slate-100 p-3"><TrendChart data={trend} /></div>}
          </Card>

          {/* Peer comparison */}
          {(data.benchmark.dept || data.benchmark.fr) && m.median_prix_m2 != null && (
            <Card title={t.peerTitle}>
              {[
                { label: m.nom_commune, v: m.median_prix_m2, c: '#0d9488' },
                { label: t.peerDept, v: data.benchmark.dept, c: '#94a3b8' },
                { label: t.peerFr, v: data.benchmark.fr, c: '#cbd5e1' },
              ].map((row) => (
                <div key={row.label} className="mb-2 flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-500">{row.label}</span>
                  <div className="h-5 flex-1 rounded bg-slate-100">
                    <div className="h-5 rounded" style={{ width: `${((row.v ?? 0) / peerMax) * 100}%`, background: row.c }} />
                  </div>
                  <span className="w-20 shrink-0 text-right font-medium tabular-nums">{row.v != null ? formatEUR(row.v, locale) : '—'}</span>
                </div>
              ))}
            </Card>
          )}

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label={t.kpiPopulation} value={data.demo?.population != null ? data.demo.population.toLocaleString('fr-FR') : '—'} />
              <Kpi label={t.kpiIncome} value={data.demo?.median_income != null ? formatEUR(data.demo.median_income, locale) : '—'} />
              <Kpi label={t.kpiAffordability}
                value={(m.median_prix_m2_appartement && data.demo?.median_income)
                  ? (Math.round((m.median_prix_m2_appartement * 70 / data.demo.median_income) * 10) / 10).toString()
                  : '—'} />
              <Kpi label={t.kpiTax} value={data.tax?.taux_tfb != null ? `${data.tax.taux_tfb}%` : '—'} />
              <Kpi label={t.colVentes} value={m.ventes_total.toLocaleString('fr-FR')} />
            </div>
          </Card>

          {/* Rental-ban timeline & renovation upside */}
          {(data.dpe?.pct_passoire != null || (renoUplift != null && renoUplift > 0)) && (
            <Card title={t.banTitle}>
              <p className="text-sm text-slate-600">{t.banText}</p>
              {data.dpe?.pct_passoire != null && (
                <p className="mt-2 text-sm">{t.passoireLbl}: <b className="text-rose-600">{data.dpe.pct_passoire}%</b></p>
              )}
              {renoUplift != null && renoUplift > 0 && (
                <p className="mt-1 text-sm">{t.renoUpside}: <b className="text-emerald-600">+{renoUplift}%</b></p>
              )}
            </Card>
          )}

          {/* Recent sales */}
          {recent.length > 0 && (
            <Card title={t.recentSales}>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">{t.colDate}</th>
                    <th className="px-2 py-1.5 text-left font-medium">{t.colType}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t.surface}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t.colPriceM2}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t.colPrice}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-1.5 text-slate-500">{formatDate(r.date, locale)}</td>
                      <td className="px-2 py-1.5">{r.type ? ((t as any)[r.type] ?? r.type) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.surface_bati != null ? formatM2(r.surface_bati) : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.prix_m2 != null ? formatPriceM2(r.prix_m2, locale) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatEUR(r.prix, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Cadre de vie */}
          {data.livability && (data.livability.schools ?? 0) > 0 && (
            <Card title={t.livabilityTitle}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Kpi label={t.schoolsLbl} value={data.livability.ecoles != null ? String(data.livability.ecoles) : '—'} />
                <Kpi label={t.collegesLbl} value={data.livability.colleges != null ? String(data.livability.colleges) : '—'} />
                <Kpi label={t.lyceesLbl} value={data.livability.lycees != null ? String(data.livability.lycees) : '—'} />
                <Kpi label={t.crimeLbl} value={data.livability.crime_rate != null ? String(data.livability.crime_rate) : '—'} />
                <Kpi label={t.eduPriority} value={data.livability.education_prioritaire ? '✓' : '—'} />
              </div>
            </Card>
          )}

          {/* Risks & nuisances */}
          {data.risk && (
            <Card title={t.risksTitle}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Kpi label={t.seismicLbl} value={data.risk.seismic_zone ?? '—'} />
                <Kpi label={t.icpeLbl} value={data.risk.icpe_count != null ? String(data.risk.icpe_count) : '—'} />
                <Kpi label={t.sevesoLbl} value={data.risk.seveso_count != null ? String(data.risk.seveso_count) : '—'} accent={(data.risk.seveso_count ?? 0) > 0} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{data.risk.risks || t.risksNone}</p>
            </Card>
          )}

          {/* Methodology & sources */}
          <Card title={t.methodology}>
            <p className="text-xs text-slate-500">DVF (DGFiP/Etalab) · DPE (ADEME) · Carte des loyers · INSEE · DGFiP fiscalité · Inside Airbnb · BAN.</p>
            <p className="mt-2 text-[10px] leading-snug text-slate-400">{t.reportDisclaimer}</p>
            <p className="mt-1 text-[10px] text-slate-400">{t.generatedOn} {today} · {brand}</p>
          </Card>
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
