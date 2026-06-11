'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCommune, getCommuneTransactions, getNews } from '@/lib/api';
import { CommuneProfile, Sale, NewsItem } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ScoreDial } from '@/components/ScoreDial';
import { EnergyBadge } from '@/components/EnergyBadge';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';

const ENERGY_COLORS: Record<string, string> = {
  A: '#319a3b', B: '#5fb84f', C: '#a8d04a', D: '#fde64b',
  E: '#fbb33d', F: '#ee732f', G: '#e30613',
};
const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export default function CommunePage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const code = String(params.code);
  const [data, setData] = useState<CommuneProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Sale[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [news, setNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCommune(code)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    getCommuneTransactions(code, txPage)
      .then((r) => { if (!cancelled) { setTx(r.results); setTxTotal(r.total); } })
      .catch(() => !cancelled && setTx([]));
    return () => { cancelled = true; };
  }, [code, txPage]);

  useEffect(() => {
    let cancelled = false;
    getNews(code).then((n) => !cancelled && setNews(n)).catch(() => {});
    return () => { cancelled = true; };
  }, [code]);

  const m = data?.metrics;
  const s = data?.scores;
  usePageTitle(m?.nom_commune ?? t.markets);
  const vv = (data?.valeur_verte ?? [])
    .filter((x) => x.median_eur_m2 != null)
    .sort((a, b) => ENERGY_ORDER.indexOf(a.classe) - ENERGY_ORDER.indexOf(b.classe));
  const vvMax = Math.max(1, ...vv.map((x) => x.median_eur_m2 as number));

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <SubNav active="markets" />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        ) : !data || !m ? (
          <div className="mt-16 text-center text-slate-400">{t.notFound}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{m.nom_commune}</h1>
                <p className="mt-0.5 text-sm text-slate-400">{m.code_departement} · INSEE {m.code_commune}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/rapport/${m.code_commune}`}
                  className="rounded-full border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                >
                  {t.generateReport}
                </a>
                <a
                  href={`/calculateur?prix=${Math.round((m.median_prix_m2_appartement ?? m.median_prix_m2 ?? 0) * 50)}&loyer=${Math.round((m.loyer_m2_appartement ?? 0) * 50)}`}
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
                >
                  {t.simulate}
                </a>
              </div>
            </div>

            {/* Scores */}
            <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.scoresTitle}</h2>
              <div className="flex flex-wrap items-center justify-around gap-4">
                <ScoreDial value={s?.score_global ?? null} label={t.scoreGlobalLbl} size={104} />
                <ScoreDial value={s?.score_yield ?? null} label={t.scoreYieldLbl} />
                <ScoreDial value={s?.score_growth ?? null} label={t.scoreGrowthLbl} />
                <ScoreDial value={s?.score_demand ?? null} label={t.scoreDemandLbl} />
              </div>
            </section>

            {/* KPIs */}
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Kpi label={t.kpiPopulation} value={data.demo?.population != null ? data.demo.population.toLocaleString('fr-FR') : '—'} />
              <Kpi label={t.kpiIncome} value={data.demo?.median_income != null ? formatEUR(data.demo.median_income, locale) : '—'} />
              <Kpi label={t.kpiPrice12m} value={(m.median_prix_m2_12m ?? m.median_prix_m2) ? formatEUR((m.median_prix_m2_12m ?? m.median_prix_m2) as number, locale) : '—'} accent />
              <Kpi label={t.kpiPriceAppt} value={m.median_prix_m2_appartement ? formatEUR(m.median_prix_m2_appartement, locale) : '—'} />
              <Kpi label={t.kpiPriceMaison} value={m.median_prix_m2_maison ? formatEUR(m.median_prix_m2_maison, locale) : '—'} />
              <Kpi label={t.kpiRent} value={m.loyer_m2_appartement != null ? `${m.loyer_m2_appartement} €` : '—'} />
              <Kpi label={t.kpiYield} value={m.rendement_brut_appartement != null ? `${m.rendement_brut_appartement}%` : '—'} accent />
              <Kpi label={t.kpiGrowth} value={m.prix_m2_growth_1y != null ? `${m.prix_m2_growth_1y > 0 ? '+' : ''}${m.prix_m2_growth_1y}%` : '—'} />
              <Kpi label={t.kpiTax} value={data.tax?.taux_tfb != null ? `${data.tax.taux_tfb}%` : '—'} />
              <Kpi label={t.kpiSales12m} value={m.ventes_12m != null ? String(m.ventes_12m) : '—'} />
            </section>

            {/* France-vs-area benchmark */}
            {m.median_prix_m2 != null && (data.benchmark.dept != null || data.benchmark.fr != null) && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.benchmarkTitle}</h2>
                {(() => {
                  const you = m.median_prix_m2 as number;
                  const dep = data.benchmark.dept;
                  const fr = data.benchmark.fr;
                  const max = Math.max(you, dep ?? 0, fr ?? 0) || 1;
                  const dDep = dep ? ((you - dep) / dep) * 100 : null;
                  const dFr = fr ? ((you - fr) / fr) * 100 : null;
                  const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
                  const col = (v: number) => (v > 0 ? 'text-rose-600' : 'text-emerald-600');
                  return (
                    <>
                      <div className="space-y-3">
                        <BenchRow label={m.nom_commune} value={you} max={max} locale={locale} accent />
                        <BenchRow label={t.benchDeptLbl} value={dep} max={max} locale={locale} />
                        <BenchRow label="France" value={fr} max={max} locale={locale} />
                      </div>
                      <p className="mt-4 text-sm text-slate-500">
                        {m.nom_commune}{' '}
                        {dDep != null && <span className={col(dDep)}>{sign(dDep)} {t.benchVsDept}</span>}
                        {dDep != null && dFr != null && ' · '}
                        {dFr != null && <span className={col(dFr)}>{sign(dFr)} {t.benchVsFr}</span>}
                      </p>
                    </>
                  );
                })()}
              </section>
            )}

            {/* Energy */}
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.energyTitle}</h2>
              <div className="mb-4 flex flex-wrap gap-6 text-sm">
                {data.dpe?.pct_passoire != null && (
                  <span className="text-slate-600">{t.passoireLbl}: <b className="text-rose-600">{data.dpe.pct_passoire}%</b></span>
                )}
                {data.dpe?.pct_abc != null && (
                  <span className="text-slate-600">{t.efficientLbl}: <b className="text-emerald-600">{data.dpe.pct_abc}%</b></span>
                )}
              </div>
              {vv.length > 0 && (
                <>
                  <p className="mb-2 text-xs text-slate-400">{t.valeurVerteLbl}</p>
                  <div className="flex items-end gap-3" style={{ height: 160 }}>
                    {vv.map((x) => (
                      <div key={x.classe} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[11px] font-medium text-slate-500">{formatEUR(x.median_eur_m2, locale)}</span>
                        <div className="w-full rounded-t-md"
                          style={{ height: `${((x.median_eur_m2 as number) / vvMax) * 120}px`, background: ENERGY_COLORS[x.classe] ?? '#94a3b8' }} />
                        <span className="text-xs font-bold" style={{ color: ENERGY_COLORS[x.classe] }}>{x.classe}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Short-term rental (Airbnb) — covered cities only */}
            {data.airbnb && data.airbnb.listings > 0 && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.shortLet}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Kpi label={t.slListings} value={data.airbnb.listings.toLocaleString('fr-FR')} />
                  <Kpi label={t.slNightly} value={data.airbnb.median_nightly != null ? formatEUR(data.airbnb.median_nightly, locale) : '—'} accent />
                  <Kpi label={t.slEntire} value={data.airbnb.pct_entire != null ? `${data.airbnb.pct_entire}%` : '—'} />
                  <Kpi label={t.slOccupancy} value={data.airbnb.median_occupancy != null ? `${data.airbnb.median_occupancy}%` : '—'} />
                  <Kpi label={t.slRevenue} value={data.airbnb.median_revenue_year != null ? formatEUR(data.airbnb.median_revenue_year, locale) : '—'} />
                </div>
                <p className="mt-3 text-[11px] text-slate-400">{t.slNote}</p>
              </section>
            )}

            {/* Cadre de vie */}
            {data.livability && (data.livability.schools ?? 0) > 0 && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.livabilityTitle}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <Kpi label={t.schoolsLbl} value={data.livability.ecoles != null ? String(data.livability.ecoles) : '—'} />
                  <Kpi label={t.collegesLbl} value={data.livability.colleges != null ? String(data.livability.colleges) : '—'} />
                  <Kpi label={t.lyceesLbl} value={data.livability.lycees != null ? String(data.livability.lycees) : '—'} />
                  <Kpi label={t.healthLbl} value={data.livability.health_equip != null ? String(data.livability.health_equip) : '—'} />
                  <Kpi label={t.transportLbl} value={data.livability.transport_equip != null ? String(data.livability.transport_equip) : '—'} />
                  <Kpi label={t.fiberLbl} value={data.livability.fiber_pct != null ? `${data.livability.fiber_pct}%` : '—'} />
                  <Kpi label={t.crimeLbl} value={data.livability.crime_rate != null ? String(data.livability.crime_rate) : '—'} />
                  <Kpi label={t.eduPriority} value={data.livability.education_prioritaire ? '✓' : '—'} />
                </div>
              </section>
            )}

            {/* Local news */}
            {news.length > 0 && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.newsTitle}</h2>
                <ul className="space-y-2">
                  {news.map((n, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ background: n.tag === 'pos' ? '#10b981' : n.tag === 'neg' ? '#ef4444' : '#cbd5e1' }} />
                      <a href={n.link} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-brand-700 hover:underline">
                        {n.title}
                        {n.source && <span className="ml-1 text-xs text-slate-400">· {n.source}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Risks & nuisances */}
            {data.risk && (
              <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.risksTitle}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi label={t.seismicLbl} value={data.risk.seismic_zone ?? '—'} />
                  <Kpi label={t.icpeLbl} value={data.risk.icpe_count != null ? String(data.risk.icpe_count) : '—'} />
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
                    <div className={`text-lg font-bold ${(data.risk.seveso_count ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {data.risk.seveso_count != null ? data.risk.seveso_count : '—'}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{t.sevesoLbl}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">{data.risk.risks || t.risksNone}</p>
              </section>
            )}

            {/* Transactions drill-down */}
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t.transactions} <span className="text-slate-300">({txTotal.toLocaleString('fr-FR')})</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">{t.colDate}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.colType}</th>
                      <th className="px-2 py-2 text-center font-medium">{t.colDpe}</th>
                      <th className="px-2 py-2 text-left font-medium">{t.colCommune}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.surface}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.rooms}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.colPriceM2}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.colPrice}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tx.length === 0 ? (
                      <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">—</td></tr>
                    ) : (
                      tx.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-2 py-2 whitespace-nowrap text-slate-500">{formatDate(s.date, locale)}</td>
                          <td className="px-2 py-2">{s.type ? ((t as any)[s.type] ?? s.type) : '—'}</td>
                          <td className="px-2 py-2 text-center"><EnergyBadge classe={s.dpe} /></td>
                          <td className="px-2 py-2 max-w-[200px] truncate text-slate-600">{s.adresse ?? '—'}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{s.surface_bati != null ? formatM2(s.surface_bati) : '—'}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{s.nb_pieces ?? '—'}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{s.prix_m2 != null ? formatPriceM2(s.prix_m2, locale) : '—'}</td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums text-slate-800">{formatEUR(s.prix, locale)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {txTotal > 20 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <button disabled={txPage <= 1} onClick={() => setTxPage((p) => p - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t.prev}</button>
                  <span className="text-slate-400">{txPage} / {Math.max(1, Math.ceil(txTotal / 20))}</span>
                  <button disabled={txPage >= Math.ceil(txTotal / 20)} onClick={() => setTxPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t.next}</button>
                </div>
              )}
            </section>

            <p className="mt-4 text-[11px] text-slate-300">{t.dataSource}</p>
          </>
        )}
      </main>
    </div>
  );
}

function BenchRow({ label, value, max, locale, accent }: {
  label: string; value: number | null; max: number; locale: string; accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={accent ? 'font-semibold text-slate-800' : 'text-slate-600'}>{label}</span>
        <span className="tabular-nums text-slate-500">{value != null ? formatEUR(value, locale) : '—'}</span>
      </div>
      <div className="mt-1 h-3 rounded-full bg-slate-100">
        <div className="h-3 rounded-full transition-all"
          style={{ width: `${value != null ? (value / max) * 100 : 0}%`, background: accent ? '#0d9488' : '#cbd5e1' }} />
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
      <div className={`text-lg font-bold ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
