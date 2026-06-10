'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCommune, getCommuneTransactions } from '@/lib/api';
import { CommuneProfile, Sale } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ScoreDial } from '@/components/ScoreDial';

const ENERGY_COLORS: Record<string, string> = {
  A: '#319a3b', B: '#5fb84f', C: '#a8d04a', D: '#fde64b',
  E: '#fbb33d', F: '#ee732f', G: '#e30613',
};
const ENERGY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export default function CommunePage() {
  const { t, locale, setLocale } = useI18n();
  const params = useParams();
  const code = String(params.code);
  const [data, setData] = useState<CommuneProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<Sale[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);

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

  const m = data?.metrics;
  const s = data?.scores;
  const vv = (data?.valeur_verte ?? [])
    .filter((x) => x.median_eur_m2 != null)
    .sort((a, b) => ENERGY_ORDER.indexOf(a.classe) - ENERGY_ORDER.indexOf(b.classe));
  const vvMax = Math.max(1, ...vv.map((x) => x.median_eur_m2 as number));

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Bloominder</span>
        </a>
        <a href="/screener" className="text-sm font-medium text-slate-500 hover:text-brand-700">{t.profileBack}</a>
        <div className="ml-auto flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLocale(l)}
              className={`rounded-full px-3 py-1.5 uppercase transition ${locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>
      </header>

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
              <a
                href={`/calculateur?prix=${Math.round((m.median_prix_m2_appartement ?? m.median_prix_m2 ?? 0) * 50)}&loyer=${Math.round((m.loyer_m2_appartement ?? 0) * 50)}`}
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
              >
                {t.simulate}
              </a>
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
              <Kpi label={t.kpiPriceAppt} value={m.median_prix_m2_appartement ? formatEUR(m.median_prix_m2_appartement, locale) : '—'} />
              <Kpi label={t.kpiPriceMaison} value={m.median_prix_m2_maison ? formatEUR(m.median_prix_m2_maison, locale) : '—'} />
              <Kpi label={t.kpiRent} value={m.loyer_m2_appartement != null ? `${m.loyer_m2_appartement} €` : '—'} />
              <Kpi label={t.kpiYield} value={m.rendement_brut_appartement != null ? `${m.rendement_brut_appartement}%` : '—'} accent />
              <Kpi label={t.kpiGrowth} value={m.prix_m2_growth_3y != null ? `${m.prix_m2_growth_3y > 0 ? '+' : ''}${m.prix_m2_growth_3y}%` : '—'} />
              <Kpi label={t.kpiSales12m} value={m.ventes_12m != null ? String(m.ventes_12m) : '—'} />
            </section>

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
                      <th className="px-2 py-2 text-left font-medium">{t.colCommune}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.surface}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.rooms}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.colPriceM2}</th>
                      <th className="px-2 py-2 text-right font-medium">{t.colPrice}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tx.length === 0 ? (
                      <tr><td colSpan={7} className="px-2 py-6 text-center text-slate-400">—</td></tr>
                    ) : (
                      tx.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-2 py-2 whitespace-nowrap text-slate-500">{formatDate(s.date, locale)}</td>
                          <td className="px-2 py-2">{s.type ? ((t as any)[s.type] ?? s.type) : '—'}</td>
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

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
      <div className={`text-lg font-bold ${accent ? 'text-brand-700' : 'text-slate-800'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
