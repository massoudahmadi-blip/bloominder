'use client';

import { useEffect, useState } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { MiniMap } from '@/components/MiniMap';
import { ScoreDial } from '@/components/ScoreDial';
import { getComparables, getCommune, AddressSuggestion } from '@/lib/api';
import { Sale, CommuneProfile } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { fetchParcelAt, ParcelFeature } from '@/lib/cadastre';
import { exportEstimationXlsx } from '@/lib/excel';
import { estimateValue } from '@/lib/avm';
import { usePageTitle } from '@/lib/useTitle';

export default function EstimationPage() {
  const { t, locale } = useI18n();
  usePageTitle(t.navEstimate);
  const [addr, setAddr] = useState<AddressSuggestion | null>(null);
  const [surface, setSurface] = useState(70);
  const [comps, setComps] = useState<Sale[]>([]);
  const [city, setCity] = useState<CommuneProfile | null>(null);
  const [parcel, setParcel] = useState<ParcelFeature | null>(null);

  // Deep-link from the map ("Analyser cette adresse") pre-seeds the report.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get('lat'));
    const lon = Number(p.get('lon'));
    if (!lat || !lon) return;
    setAddr({
      label: p.get('label') || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      lat, lon,
      citycode: p.get('citycode') || undefined,
    });
    const s = Number(p.get('surface'));
    if (s > 0) setSurface(Math.round(s));
  }, []);

  useEffect(() => {
    if (!addr) return;
    setComps([]); setCity(null); setParcel(null);
    getComparables(addr.lat, addr.lon).then(setComps).catch(() => {});
    if (addr.citycode) getCommune(addr.citycode).then(setCity).catch(() => {});
    fetchParcelAt(addr.lon, addr.lat).then(setParcel).catch(() => {});
  }, [addr]);

  const est = estimateValue(comps, surface, addr ? { lat: addr.lat, lon: addr.lon } : undefined);
  const { value, low, high, medianM2: med, n } = est;
  const rel = est.reliability === 'high' ? t.relHigh : est.reliability === 'medium' ? t.relMedium : t.relLow;
  const m = city?.metrics;

  const downloadXlsx = () => {
    if (!addr) return;
    exportEstimationXlsx({
      fileName: `bloominder-estimation-${new Date().toISOString().slice(0, 10)}.xlsx`,
      title: t.estimationTitle,
      generatedLabel: `${t.xlsGenerated} ${new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}`,
      disclaimer: t.xlsDisclaimer,
      address: addr.label,
      surface,
      estimate: { value, low, high, medianM2: med, reliability: rel, n },
      parcel: parcel ? {
        ref: `${parcel.properties.section ?? ''} ${parcel.properties.numero ?? ''}`.trim(),
        land: parcel.properties.contenance != null ? Number(parcel.properties.contenance) : null,
      } : null,
      city: m ? {
        name: m.nom_commune, scoreGlobal: city?.scores?.score_global ?? null,
        medianM2: m.median_prix_m2 ?? null, yieldPct: m.rendement_brut_appartement ?? null,
        population: city?.demo?.population ?? null, income: city?.demo?.median_income ?? null,
      } : null,
      comps: comps.slice(0, 15).map((c) => ({
        date: formatDate(c.date, locale), type: c.type ? ((t as any)[c.type] ?? c.type) : '—',
        surface: c.surface_bati ?? null, prixM2: c.prix_m2 ?? null, prix: c.prix,
      })),
      labels: {
        sEstimate: t.estValue, sPosition: t.position, sCity: t.cityContext, sComps: t.comparables,
        estValue: t.estValue, estRange: t.estRange, estPerM2: t.estPerM2, reliability: t.reliability, basedOn: t.basedOn,
        surface: t.surface, parcelRef: t.parcelLabel, land: t.land,
        scoreGlobal: t.scoreGlobalLbl, priceM2: t.colPriceM2, yieldLbl: t.kpiYield, population: t.kpiPopulation, income: t.kpiIncome,
        cDate: t.colDate, cType: t.colType, cSurface: t.surface, cPriceM2: t.colPriceM2, cPrice: t.colPrice,
      },
    });
  };

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="no-print">
        <SubNav active="estimate" />
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.estimationTitle}</h1>
        <div className="no-print mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1"><SearchBar onLocate={setAddr} /></div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">{t.fSurfaceHab}</span>
            <input type="number" value={surface} onChange={(e) => setSurface(Number(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
          </label>
          {addr && (
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t.printPdf} / PDF</button>
              <button onClick={downloadXlsx} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">{t.downloadExcel}</button>
            </div>
          )}
        </div>

        {!addr ? (
          <p className="mt-10 text-center text-slate-400">{t.searchToEstimate}</p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="report-card rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.estValue}</div>
              <div className="mt-1 text-3xl font-bold text-brand-800">
                {value != null ? formatEUR(value, locale) : '—'}
              </div>
              {low != null && high != null && (
                <div className="text-sm text-slate-500">{formatEUR(low, locale)} – {formatEUR(high, locale)}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                <span>{t.estPerM2}: <b>{med != null ? formatPriceM2(med, locale) : '—'}</b></span>
                <span>{t.reliability}: <b>{rel}</b></span>
                <span className="text-slate-400">{n} {t.basedOn}</span>
              </div>
            </div>

            {/* Position + cadastre */}
            <section className="report-card rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.position}</h2>
              <p className="text-sm text-slate-700">{addr.label}</p>
              {parcel && (
                <p className="mb-3 mt-1 text-xs text-slate-500">
                  {t.parcelLabel} {parcel.properties.section} {parcel.properties.numero}
                  {parcel.properties.contenance != null && <> · {t.land} {formatM2(Number(parcel.properties.contenance))}</>}
                </p>
              )}
              <div className="mt-3"><MiniMap lon={addr.lon} lat={addr.lat} parcel={parcel} /></div>
            </section>

            {/* City context */}
            {m && (
              <section className="report-card rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.cityContext} — {m.nom_commune}</h2>
                  <a href={`/commune/${m.code_commune}`} className="no-print text-xs font-medium text-brand-700 hover:underline">→ {t.report}</a>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <ScoreDial value={city?.scores?.score_global ?? null} label={t.scoreGlobalLbl} />
                  <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                    <Kpi label={t.colPriceM2} value={m.median_prix_m2 ? formatEUR(m.median_prix_m2, locale) : '—'} />
                    <Kpi label={t.kpiYield} value={m.rendement_brut_appartement != null ? `${m.rendement_brut_appartement}%` : '—'} />
                    <Kpi label={t.kpiPopulation} value={city?.demo?.population != null ? city.demo.population.toLocaleString('fr-FR') : '—'} />
                    <Kpi label={t.kpiIncome} value={city?.demo?.median_income != null ? formatEUR(city.demo.median_income, locale) : '—'} />
                    <Kpi label={t.schoolsLbl} value={city?.livability?.ecoles != null ? String(city.livability.ecoles) : '—'} />
                    <Kpi label={t.crimeLbl} value={city?.livability?.crime_rate != null ? String(city.livability.crime_rate) : '—'} />
                  </div>
                </div>
                {city?.risk?.risks && <p className="mt-3 text-xs text-slate-500">{t.risksTitle}: {city.risk.risks}</p>}
              </section>
            )}

            {/* Comparables */}
            {comps.length > 0 && (
              <section className="report-card rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
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
                    {comps.slice(0, 10).map((c) => (
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

            <p className="text-[11px] text-slate-300">{t.estimateNote} · {t.dataSource}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="text-base font-bold text-slate-800">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
