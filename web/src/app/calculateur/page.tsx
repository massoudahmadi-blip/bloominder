'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export default function CalculatorPage() {
  const { t, locale, setLocale } = useI18n();

  // Acquisition
  const [price, setPrice] = useState(150000);
  const [notairePct, setNotairePct] = useState(7.5);
  const [works, setWorks] = useState(0);
  const [furnishing, setFurnishing] = useState(0);
  // Income
  const [rent, setRent] = useState(700);
  // Charges
  const [taxe, setTaxe] = useState(800);
  const [copro, setCopro] = useState(0);
  const [mgmtPct, setMgmtPct] = useState(7);
  const [insurance, setInsurance] = useState(30);
  const [vacancyPct, setVacancyPct] = useState(5);
  // Financing
  const [down, setDown] = useState(30000);
  const [rate, setRate] = useState(3.5);
  const [term, setTerm] = useState(20);

  // Pre-fill from a city profile link: /calculateur?prix=...&loyer=...
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const prix = Number(p.get('prix'));
    const loyer = Number(p.get('loyer'));
    if (prix > 0) setPrice(Math.round(prix));
    if (loyer > 0) setRent(Math.round(loyer));
  }, []);

  const r = useMemo(() => {
    const notaire = price * (notairePct / 100);
    const total = price + notaire + works + furnishing;
    const loan = Math.max(0, total - down);
    const mr = rate / 100 / 12;
    const n = term * 12;
    const payment = loan <= 0 ? 0 : mr === 0 ? loan / n : (loan * mr) / (1 - Math.pow(1 + mr, -n));
    const annualRent = rent * 12;
    const monthlyCharges = taxe / 12 + copro + rent * (mgmtPct / 100) + insurance + rent * (vacancyPct / 100);
    const netOpsM = rent - monthlyCharges; // before mortgage
    const cashflowM = netOpsM - payment;
    const grossYield = total > 0 ? (annualRent / total) * 100 : 0;
    const netYield = total > 0 ? (netOpsM * 12) / total * 100 : 0;
    const cashInvested = down > 0 ? down + notaire * 0 : total; // apport is the cash in
    const coc = cashInvested > 0 ? (cashflowM * 12) / cashInvested * 100 : 0;
    return { notaire, total, loan, payment, monthlyCharges, cashflowM, grossYield, netYield, coc };
  }, [price, notairePct, works, furnishing, rent, taxe, copro, mgmtPct, insurance, vacancyPct, down, rate, term]);

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
        <nav className="flex items-center gap-1 text-sm">
          <a href="/" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.mapTab}</a>
          <a href="/screener" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.markets}</a>
          <a href="/calculateur" className="rounded-lg px-3 py-1.5 font-medium text-brand-700">{t.calculator}</a>
        </nav>
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.calcTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.calcSubtitle}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Inputs */}
          <div className="space-y-5">
            <Section title={t.secAcquisition}>
              <Num label={t.fPrice} value={price} onChange={setPrice} suffix="€" />
              <Num label={t.fNotaire} value={notairePct} onChange={setNotairePct} suffix="%" step={0.1} />
              <Num label={t.fWorks} value={works} onChange={setWorks} suffix="€" />
              <Num label={t.fFurnishing} value={furnishing} onChange={setFurnishing} suffix="€" />
            </Section>
            <Section title={t.secIncome}>
              <Num label={t.fRent} value={rent} onChange={setRent} suffix="€" />
            </Section>
            <Section title={t.secCharges}>
              <Num label={t.fTaxe} value={taxe} onChange={setTaxe} suffix="€" />
              <Num label={t.fCopro} value={copro} onChange={setCopro} suffix="€" />
              <Num label={t.fMgmt} value={mgmtPct} onChange={setMgmtPct} suffix="%" step={0.5} />
              <Num label={t.fInsurance} value={insurance} onChange={setInsurance} suffix="€" />
              <Num label={t.fVacancy} value={vacancyPct} onChange={setVacancyPct} suffix="%" step={0.5} />
            </Section>
            <Section title={t.secFinancing}>
              <Num label={t.fDown} value={down} onChange={setDown} suffix="€" />
              <Num label={t.fRate} value={rate} onChange={setRate} suffix="%" step={0.1} />
              <Num label={t.fTerm} value={term} onChange={setTerm} suffix="ans" />
            </Section>
          </div>

          {/* Results */}
          <div className="lg:sticky lg:top-6 h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.secResults}</h2>
            <div className="space-y-2.5 text-sm">
              <Row label={t.rTotalCost} value={formatEUR(r.total, locale)} />
              <Row label={t.rLoan} value={formatEUR(r.loan, locale)} />
              <Row label={t.rPayment} value={`${formatEUR(r.payment, locale)} /mo`} />
              <Row label={t.rChargesM} value={`${formatEUR(r.monthlyCharges, locale)} /mo`} />
              <div className="my-2 border-t border-slate-100" />
              <Row label={t.rGross} value={`${r.grossYield.toFixed(1)}%`} />
              <Row label={t.rNet} value={`${r.netYield.toFixed(1)}%`} strong />
              <Row label={t.rCoC} value={`${r.coc.toFixed(1)}%`} />
              <div className="my-2 border-t border-slate-100" />
              <div className="rounded-xl p-3" style={{ background: r.cashflowM >= 0 ? '#ecfdf5' : '#fef2f2' }}>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">{t.rCashflowM}</span>
                  <span className="text-lg font-bold" style={{ color: r.cashflowM >= 0 ? '#059669' : '#dc2626' }}>
                    {formatEUR(Math.round(r.cashflowM), locale)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{t.rCashflowY}</span>
                  <span>{formatEUR(Math.round(r.cashflowM * 12), locale)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

function Num({ label, value, onChange, suffix, step = 1 }: {
  label: string; value: number; onChange: (n: number) => void; suffix?: string; step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <div className="flex items-center rounded-lg border border-slate-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          className="w-full rounded-lg bg-transparent px-2.5 py-1.5 text-sm outline-none"
        />
        {suffix && <span className="pr-2.5 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-bold text-brand-700' : 'font-medium text-slate-800'}>{value}</span>
    </div>
  );
}
