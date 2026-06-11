'use client';

import { useEffect, useState } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { MiniMap } from '@/components/MiniMap';
import { ScoreDial } from '@/components/ScoreDial';
import { getComparables, getCommune, AddressSuggestion } from '@/lib/api';
import { Sale, CommuneProfile } from '@/lib/types';
import { formatEUR, formatM2, formatDate, formatPriceM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export default function EstimationPage() {
  const { t, locale, setLocale } = useI18n();
  const [addr, setAddr] = useState<AddressSuggestion | null>(null);
  const [surface, setSurface] = useState(70);
  const [comps, setComps] = useState<Sale[]>([]);
  const [city, setCity] = useState<CommuneProfile | null>(null);

  useEffect(() => {
    if (!addr) return;
    setComps([]); setCity(null);
    getComparables(addr.lat, addr.lon).then(setComps).catch(() => {});
    if (addr.citycode) getCommune(addr.citycode).then(setCity).catch(() => {});
  }, [addr]);

  const m2 = comps.map((c) => c.prix_m2).filter((v): v is number => v != null).sort((a, b) => a - b);
  const n = m2.length;
  const at = (q: number) => (n ? m2[Math.min(n - 1, Math.floor(n * q))] : null);
  const med = n ? m2[Math.floor(n / 2)] : null;
  const p25 = at(0.25), p75 = at(0.75);
  const value = med != null ? Math.round(med * surface) : null;
  const low = p25 != null ? Math.round(p25 * surface) : null;
  const high = p75 != null ? Math.round(p75 * surface) : null;
  const rel = n >= 15 ? t.relHigh : n >= 6 ? t.relMedium : t.relLow;
  const m = city?.metrics;

  return (
    <div className="min-h-[100dvh] bg-stone-50">
      <header className="no-print flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" /></svg>
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">Bloominder</span>
        </a>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <a href="/" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.mapTab}</a>
          <a href="/screener" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.markets}</a>
          <a href="/calculateur" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100">{t.calculator}</a>
          <a href="/estimation" className="rounded-lg px-3 py-1.5 font-medium text-brand-700">{t.navEstimate}</a>
        </nav>
        <div className="ml-auto flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
          {(['fr', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLocale(l)} className={`rounded-full px-3 py-1.5 uppercase transition ${locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.estimationTitle}</h1>
        <div className="no-print mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1"><SearchBar onLocate={setAddr} /></div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-slate-500">{t.fSurfaceHab}</span>
            <input type="number" value={surface} onChange={(e) => setSurface(Number(e.target.value) || 0)}
              className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
          </label>
          {addr && <button onClick={() => window.print()} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">{t.printPdf} / PDF</button>}
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
              <p className="mb-3 text-sm text-slate-700">{addr.label}</p>
              <MiniMap lon={addr.lon} lat={addr.lat} />
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
