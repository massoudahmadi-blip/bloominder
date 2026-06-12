'use client';

import { useEffect, useState } from 'react';
import { getComparables, getCommune } from '@/lib/api';
import { Sale, CommuneProfile } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { ScoreDial } from '@/components/ScoreDial';
import { EnergyBadge } from '@/components/EnergyBadge';
import { MiniMap } from '@/components/MiniMap';
import { fetchParcelAt, ParcelFeature } from '@/lib/cadastre';
import { estimateValue } from '@/lib/avm';
import { usePageTitle } from '@/lib/useTitle';
import { RiskScorecard } from '@/components/RiskScorecard';
import { MarketTemperature } from '@/components/MarketTemperature';

const ENERGY_COLORS: Record<string, string> = {
  A: '#319a3b', B: '#5fb84f', C: '#a8d04a', D: '#fde64b', E: '#fbb33d', F: '#ee732f', G: '#e30613',
};

interface Seed {
  lat: number; lon: number; label: string; citycode?: string;
  surface?: number; terrain?: number; type?: string; prix?: number;
  date?: string; prixm2?: number; dpe?: string; pieces?: number;
  resale?: number; resaleDate?: string;
}

// Rough energy-renovation cost (€/m²) to lift a property out of the rental ban.
const RENO_COST_PER_M2: Record<string, [number, number]> = {
  G: [350, 700], F: [250, 500], E: [150, 350],
};

export default function AdressePage() {
  const { t, locale } = useI18n();
  const [seed, setSeed] = useState<Seed | null>(null);
  const [comps, setComps] = useState<Sale[]>([]);
  const [city, setCity] = useState<CommuneProfile | null>(null);
  const [parcel, setParcel] = useState<ParcelFeature | null>(null);
  usePageTitle(seed?.label ?? t.addressReport);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get('lat'));
    const lon = Number(p.get('lon'));
    if (!lat || !lon) return;
    const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
    setSeed({
      lat, lon,
      label: p.get('label') || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      citycode: p.get('citycode') || undefined,
      surface: num('surface'), terrain: num('terrain'), type: p.get('type') || undefined,
      prix: num('prix'), date: p.get('date') || undefined, prixm2: num('prixm2'),
      dpe: p.get('dpe') || undefined, pieces: num('pieces'),
      resale: num('resale'), resaleDate: p.get('resaledate') || undefined,
    });
  }, []);

  useEffect(() => {
    if (!seed) return;
    // Like-for-like comparables (same property type) make the estimate sharper.
    getComparables(seed.lat, seed.lon, seed.type ?? null).then(setComps).catch(() => {});
    if (seed.citycode) getCommune(seed.citycode).then(setCity).catch(() => {});
    fetchParcelAt(seed.lon, seed.lat).then(setParcel).catch(() => {});
  }, [seed]);

  // Robust comparables-based estimate for the property's living area.
  const surface = seed?.surface || 70;
  const est = estimateValue(comps, surface, seed ? { lat: seed.lat, lon: seed.lon } : undefined);
  const { value, low, high, medianM2: med, n } = est;
  const rel = est.reliability === 'high' ? t.relHigh : est.reliability === 'medium' ? t.relMedium : t.relLow;
  // Houses/flats estimate well from comps; commercial/land/outbuildings are too
  // heterogeneous for a confident single figure — show a range + caveat instead.
  const residential = !!seed?.type && /maison|appartement/i.test(seed.type);
  const dpeClass = seed?.dpe?.toUpperCase();
  const reno = dpeClass && RENO_COST_PER_M2[dpeClass] ? RENO_COST_PER_M2[dpeClass] : null;
  const renoLow = reno ? Math.round(reno[0] * surface) : null;
  const renoHigh = reno ? Math.round(reno[1] * surface) : null;
  const banText = dpeClass === 'G' ? t.riskBan2025 : dpeClass === 'F' ? t.riskBan2028 : dpeClass === 'E' ? t.riskBan2034 : null;
  const m = city?.metrics;
  const land = parcel?.properties.contenance != null ? Number(parcel.properties.contenance) : (seed?.terrain ?? null);

  const vv = (city?.valeur_verte ?? []).filter((x) => x.median_eur_m2 != null);
  const vvMax = Math.max(1, ...vv.map((x) => x.median_eur_m2 as number));
  const s = city?.scores;

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="no-print"><SubNav active="markets" /></div>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {!seed ? (
          <p className="mt-16 text-center text-slate-400">{t.notFound}</p>
        ) : (
          <>
            {/* Print-only branded header (nav is hidden when printing) */}
            <div className="mb-4 hidden print:block">
              <div className="font-serif text-xl font-semibold text-brand-700">Bloominder</div>
              <div className="text-xs text-slate-400">bloominder.com · {t.addressReport}</div>
            </div>

            {/* Hero */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{t.addressReport}</p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{seed.label}</h1>
                {m && <p className="mt-0.5 text-sm text-slate-400">{m.nom_commune} · {m.code_departement}</p>}
              </div>
              <div className="no-print flex flex-wrap gap-2">
                {m && (
                  <a href={`/commune/${m.code_commune}`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">{t.viewCity}</a>
                )}
                <a
                  href={`/calculateur?prix=${seed.prix || (med != null ? Math.round(med * surface) : 0)}&loyer=${Math.round((m?.loyer_m2_appartement ?? 0) * surface)}`}
                  className="rounded-full border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-50"
                >
                  {t.simulate}
                </a>
                <button onClick={() => window.print()} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700">{t.printPdf} / PDF</button>
              </div>
            </div>

            {/* Recorded sale + estimate */}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.transactionTitle}</h2>
                {seed.prix ? (
                  <>
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-bold text-slate-900">{formatEUR(seed.prix, locale)}</span>
                      {seed.prixm2 != null && <span className="text-sm font-medium text-brand-700">{formatPriceM2(seed.prixm2, locale)}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Fact label={t.colType} value={seed.type ? ((t as any)[seed.type] ?? seed.type) : '—'} />
                      <Fact label={t.surface} value={seed.surface ? formatM2(seed.surface) : '—'} />
                      <Fact label={t.land} value={land != null ? formatM2(land) : '—'} />
                      <Fact label={t.soldOn} value={seed.date ? formatDate(seed.date, locale) : '—'} />
                      <Fact label="DPE" value={seed.dpe ?? '—'} badge={seed.dpe ?? undefined} />
                      {parcel && <Fact label={t.parcelLabel} value={`${parcel.properties.section ?? ''} ${parcel.properties.numero ?? ''}`.trim() || '—'} />}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">—</p>
                )}
              </section>

              <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.estValue}</h2>
                {residential ? (
                  <>
                    <div className="text-3xl font-bold text-brand-800">{value != null ? formatEUR(value, locale) : '—'}</div>
                    {low != null && high != null && (
                      <div className="text-sm text-slate-500">{formatEUR(low, locale)} – {formatEUR(high, locale)}</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-700">
                      {low != null && high != null
                        ? `${formatEUR(low, locale)} – ${formatEUR(high, locale)}`
                        : (value != null ? `≈ ${formatEUR(value, locale)}` : '—')}
                    </div>
                    <div className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                      {t.limitedComparability}
                    </div>
                  </>
                )}
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                  <span>{t.estPerM2}: <b>{med != null ? formatPriceM2(med, locale) : '—'}</b></span>
                  <span>{t.reliability}: <b>{residential ? rel : t.relLow}</b></span>
                  <span className="text-slate-400">{n} {t.basedOn}</span>
                </div>
              </section>
            </div>

            {/* Same-property price history (resale) */}
            {seed.resale != null && (
              <div className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <span className="font-semibold text-slate-700">{t.histTitle}: </span>
                <span className={seed.resale >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {seed.resale > 0 ? '+' : ''}{seed.resale}%
                </span>{' '}
                <span className="text-slate-500">{t.histVsPrev}{seed.resaleDate ? ` (${new Date(seed.resaleDate).getFullYear()})` : ''}</span>
              </div>
            )}

            {/* DPE rental-ban + renovation cost */}
            {banText && (
              <div className="report-card mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t.renoTitle} — DPE {dpeClass}
                </div>
                <p className="mt-1 text-sm text-amber-700">{banText}.</p>
                {renoLow != null && renoHigh != null && (
                  <p className="mt-1 text-sm text-amber-700">{t.renoCost}: <b>{formatEUR(renoLow, locale)} – {formatEUR(renoHigh, locale)}</b></p>
                )}
                <p className="mt-1 text-[11px] text-amber-600">{t.renoNote}</p>
              </div>
            )}

            {/* Risk scorecard */}
            <div className="mt-4">
              <RiskScorecard
                salePrice={seed.prix ?? null}
                estimate={value}
                daysToSell={m?.median_days_to_sell ?? null}
                dpe={seed.dpe ?? null}
                seveso={city?.risk?.seveso_count ?? null}
                risksText={city?.risk?.risks ?? null}
                priceM2Appt={m?.median_prix_m2_appartement ?? null}
                income={city?.demo?.median_income ?? null}
                growth1y={m?.prix_m2_growth_1y ?? null}
              />
            </div>

            {m && (
              <div className="mt-4">
                <MarketTemperature growth1y={m.prix_m2_growth_1y ?? null} daysToSell={m.median_days_to_sell ?? null} />
              </div>
            )}

            {/* Position */}
            <section className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.position}</h2>
              <MiniMap lon={seed.lon} lat={seed.lat} parcel={parcel} />
            </section>

            {/* Market context (Markets-style) */}
            {m && (
              <>
                <section className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.scoresTitle} — {m.nom_commune}</h2>
                  <div className="flex flex-wrap items-center justify-around gap-4">
                    <ScoreDial value={s?.score_global ?? null} label={t.scoreGlobalLbl} size={104} />
                    <ScoreDial value={s?.score_yield ?? null} label={t.scoreYieldLbl} />
                    <ScoreDial value={s?.score_growth ?? null} label={t.scoreGrowthLbl} />
                    <ScoreDial value={s?.score_demand ?? null} label={t.scoreDemandLbl} />
                  </div>
                </section>

                <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <Kpi label={t.kpiPopulation} value={city?.demo?.population != null ? city.demo.population.toLocaleString('fr-FR') : '—'} />
                  <Kpi label={t.kpiIncome} value={city?.demo?.median_income != null ? formatEUR(city.demo.median_income, locale) : '—'} />
                  <Kpi label={t.kpiPriceAppt} value={m.median_prix_m2_appartement ? formatEUR(m.median_prix_m2_appartement, locale) : '—'} />
                  <Kpi label={t.kpiYield} value={m.rendement_brut_appartement != null ? `${m.rendement_brut_appartement}%` : '—'} accent />
                  <Kpi label={t.kpiGrowth} value={m.prix_m2_growth_1y != null ? `${m.prix_m2_growth_1y > 0 ? '+' : ''}${m.prix_m2_growth_1y}%` : '—'} />
                  <Kpi label={t.kpiTax} value={city?.tax?.taux_tfb != null ? `${city.tax.taux_tfb}%` : '—'} />
                </section>

                {/* Benchmark band */}
                {m.median_prix_m2 != null && (city.benchmark.dept != null || city.benchmark.fr != null) && (
                  <section className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.benchmarkTitle}</h2>
                    {(() => {
                      const you = m.median_prix_m2 as number;
                      const dep = city.benchmark.dept, fr = city.benchmark.fr;
                      const max = Math.max(you, dep ?? 0, fr ?? 0) || 1;
                      const sign = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
                      const col = (v: number) => (v > 0 ? 'text-rose-600' : 'text-emerald-600');
                      const dDep = dep ? ((you - dep) / dep) * 100 : null;
                      const dFr = fr ? ((you - fr) / fr) * 100 : null;
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

                {/* Energy / green value */}
                {(city.dpe?.pct_passoire != null || vv.length > 0) && (
                  <section className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.energyTitle}</h2>
                    <div className="mb-4 flex flex-wrap gap-6 text-sm">
                      {city.dpe?.pct_passoire != null && <span className="text-slate-600">{t.passoireLbl}: <b className="text-rose-600">{city.dpe.pct_passoire}%</b></span>}
                      {city.dpe?.pct_abc != null && <span className="text-slate-600">{t.efficientLbl}: <b className="text-emerald-600">{city.dpe.pct_abc}%</b></span>}
                    </div>
                    {vv.length > 0 && (
                      <>
                        <p className="mb-2 text-xs text-slate-400">{t.valeurVerteLbl}</p>
                        <div className="flex items-end gap-3" style={{ height: 160 }}>
                          {vv.map((x) => (
                            <div key={x.classe} className="flex flex-1 flex-col items-center justify-end gap-1">
                              <span className="text-[11px] font-medium text-slate-500">{formatEUR(x.median_eur_m2, locale)}</span>
                              <div className="w-full rounded-t-md" style={{ height: `${((x.median_eur_m2 as number) / vvMax) * 120}px`, background: ENERGY_COLORS[x.classe] ?? '#94a3b8' }} />
                              <span className="text-xs font-bold" style={{ color: ENERGY_COLORS[x.classe] }}>{x.classe}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                )}
              </>
            )}

            {/* Comparables */}
            {comps.length > 0 && (
              <section className="report-card mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.comparables}</h2>
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
                    {comps.slice(0, 12).map((c) => (
                      <tr key={c.id}>
                        <td className="px-2 py-1.5 text-slate-500">{formatDate(c.date, locale)}</td>
                        <td className="px-2 py-1.5">{c.type ? ((t as any)[c.type] ?? c.type) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.surface_bati != null ? formatM2(c.surface_bati) : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.prix_m2 != null ? formatPriceM2(c.prix_m2, locale) : '—'}</td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatEUR(c.prix, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <p className="mt-4 text-[11px] text-slate-300">{t.estimateNote} · {t.dataSource}</p>
          </>
        )}
      </main>
    </div>
  );
}

function Fact({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {badge ? <EnergyBadge classe={badge} size={18} /> : value}
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
        <div className="h-3 rounded-full transition-all" style={{ width: `${value != null ? (value / max) * 100 : 0}%`, background: accent ? '#0d9488' : '#cbd5e1' }} />
      </div>
    </div>
  );
}
