'use client';

import { useEffect, useMemo, useState } from 'react';
import { getTrend } from '@/lib/api';
import { YearTrend } from '@/lib/types';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const MAISON = '#0d9488';
const APPART = '#0f172a';

// Median €/m² (maison + appartement lines) + sales volume (bars) by year,
// with a mini "how did my property evolve" calculator.
export function PriceEvolutionChart({ code, locale }: { code: string; locale: string }) {
  const { t } = useI18n();
  const [maison, setMaison] = useState<YearTrend[]>([]);
  const [appart, setAppart] = useState<YearTrend[]>([]);
  const [vol, setVol] = useState<YearTrend[]>([]);

  useEffect(() => {
    getTrend(code, 'Maison').then(setMaison).catch(() => setMaison([]));
    getTrend(code, 'Appartement').then(setAppart).catch(() => setAppart([]));
    getTrend(code).then(setVol).catch(() => setVol([]));
  }, [code]);

  const mM = useMemo(() => new Map(maison.map((x) => [x.annee, x.median_eur_m2])), [maison]);
  const mA = useMemo(() => new Map(appart.map((x) => [x.annee, x.median_eur_m2])), [appart]);
  const mV = useMemo(() => new Map(vol.map((x) => [x.annee, x.ventes])), [vol]);
  const years = useMemo(() => {
    const s = new Set<number>([...mM.keys(), ...mA.keys(), ...mV.keys()]);
    return [...s].filter((y) => y >= 2014).sort((a, b) => a - b);
  }, [mM, mA, mV]);

  // Mini-calculator state.
  const [cy, setCy] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [ptype, setPtype] = useState<'maison' | 'appartement'>('maison');
  useEffect(() => { if (years.length && cy == null) setCy(years[0]); }, [years, cy]);

  if (years.length < 2) return null;

  const W = 580, H = 240, padL = 46, padR = 44, padB = 26, padT = 22;
  const priceVals = [...mM.values(), ...mA.values()].filter((v): v is number => v != null);
  const pMax = Math.max(...priceVals) * 1.08, pMin = Math.min(...priceVals) * 0.9;
  const vMax = Math.max(1, ...[...mV.values()].filter((v): v is number => v != null));
  const x = (i: number) => padL + (i / (years.length - 1)) * (W - padL - padR);
  const yP = (v: number) => H - padB - ((v - pMin) / (pMax - pMin || 1)) * (H - padT - padB);
  const yV = (v: number) => ((v / vMax) * (H - padT - padB));
  const bw = (W - padL - padR) / years.length * 0.55;

  const line = (m: Map<number, number | null>) => years
    .map((yr, i) => (m.get(yr) != null ? `${x(i)},${yP(m.get(yr) as number)}` : null))
    .filter(Boolean).join(' ');

  const evol = (m: Map<number, number | null>) => {
    const first = m.get(years[0]); const last = m.get(years[years.length - 1]);
    return first && last ? Math.round(((last - first) / first) * 100) : null;
  };
  const evolM = evol(mM), evolA = evol(mA);

  const srcMap = ptype === 'maison' ? mM : mA;
  const latestYear = years[years.length - 1];
  const baseMed = cy != null ? srcMap.get(cy) : null;
  const lastMed = srcMap.get(latestYear);
  const projected = baseMed && lastMed && Number(price) > 0 ? Math.round(Number(price) * (lastMed / baseMed)) : null;
  const projEvol = baseMed && lastMed ? Math.round(((lastMed - baseMed) / baseMed) * 100) : null;

  return (
    <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pevTitle} ({years[0]}–{latestYear})</h2>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Lg color={MAISON} label={`${t.choroMaison} (€/m²)`} />
        <Lg color={APPART} label={`${t.choroAppt} (€/m²)`} />
        <Lg color="#e2e8f0" label={t.pevVolume} />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        {years.map((yr, i) => {
          const v = mV.get(yr); if (v == null) return null;
          const h = yV(v);
          return <rect key={yr} x={x(i) - bw / 2} y={H - padB - h} width={bw} height={h} rx={2} fill="#e2e8f0" />;
        })}
        <polyline points={line(mA)} fill="none" stroke={APPART} strokeWidth={2} />
        <polyline points={line(mM)} fill="none" stroke={MAISON} strokeWidth={2.5} />
        {years.map((yr, i) => (
          <text key={yr} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize={9}>{yr}</text>
        ))}
        <text x={4} y={padT} className="fill-slate-400" fontSize={9}>{Math.round(pMax).toLocaleString('fr-FR')}</text>
        <text x={4} y={H - padB} className="fill-slate-400" fontSize={9}>{Math.round(pMin).toLocaleString('fr-FR')}</text>
      </svg>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {evolM != null && <EvolCard label={`${t.choroMaison} ${years[0]}→${latestYear}`} pct={evolM} from={mM.get(years[0]) as number} to={mM.get(latestYear) as number} locale={locale} />}
        {evolA != null && <EvolCard label={`${t.choroAppt} ${years[0]}→${latestYear}`} pct={evolA} from={mA.get(years[0]) as number} to={mA.get(latestYear) as number} locale={locale} />}
      </div>

      {/* Mini-calculator */}
      <div className="mt-4 rounded-xl bg-slate-50 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.pevEstimTitle}</div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">{t.pevYear}</span>
            <select value={cy ?? ''} onChange={(e) => setCy(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
              {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">{t.pevPrice}</span>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex : 250 000"
              className="w-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-500">{t.pevType}</span>
            <select value={ptype} onChange={(e) => setPtype(e.target.value as 'maison' | 'appartement')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
              <option value="maison">{t.choroMaison}</option>
              <option value="appartement">{t.choroAppt}</option>
            </select>
          </label>
          {projected != null && (
            <div className="ml-auto text-right">
              <div className="text-[11px] text-slate-500">{t.pevResult} {projEvol != null && <span className={projEvol >= 0 ? 'text-emerald-600' : 'text-rose-600'}>({projEvol > 0 ? '+' : ''}{projEvol}%)</span>}</div>
              <div className="text-xl font-bold text-brand-800">{formatEUR(projected, locale)}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Lg({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5 text-slate-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>;
}

function EvolCard({ label, pct, from, to, locale }: { label: string; pct: number; from: number; to: number; locale: string }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-2xl font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct > 0 ? '+' : ''}{pct} %</div>
      <div className="text-[11px] text-slate-400">{formatEUR(from, locale)} → {formatEUR(to, locale)} /m²</div>
    </div>
  );
}
