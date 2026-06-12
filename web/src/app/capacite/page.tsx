'use client';

import { useMemo, useState } from 'react';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';

export default function CapacitePage() {
  const { t, locale } = useI18n();
  usePageTitle(t.navCanIBuy);

  const [income, setIncome] = useState(3500);     // net household income / month
  const [debts, setDebts] = useState(0);          // existing monthly credit payments
  const [apport, setApport] = useState(30000);
  const [rate, setRate] = useState(3.5);
  const [term, setTerm] = useState(25);           // HCSF caps at 25 years
  const [loanInsPct, setLoanInsPct] = useState(0.34);
  const [notairePct, setNotairePct] = useState(7.5);

  const r = useMemo(() => {
    const cappedTerm = Math.min(term, 25);
    const maxAllIn = Math.max(0, income * 0.35 - debts); // HCSF: total debt service ≤ 35% of income
    const mr = rate / 100 / 12;
    const n = cappedTerm * 12;
    const pmtFactor = mr === 0 ? 1 / n : mr / (1 - Math.pow(1 + mr, -n));
    const insFactor = loanInsPct / 100 / 12; // insurance on initial capital, per month per unit loan
    const loan = maxAllIn > 0 ? maxAllIn / (pmtFactor + insFactor) : 0;
    const maxPrice = (loan + apport) / (1 + notairePct / 100);
    const debtRatio = income > 0 ? ((maxAllIn + debts) / income) * 100 : 0;
    return { maxAllIn, loan, maxPrice, debtRatio, cappedTerm };
  }, [income, debts, apport, rate, term, loanInsPct, notairePct]);

  const canBorrow = r.loan > 0;

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SubNav active="capacity" />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.capTitle}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.capSubtitle}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Inputs */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Num label={t.capIncome} value={income} onChange={setIncome} suffix="€" />
              <Num label={t.capDebts} value={debts} onChange={setDebts} suffix="€" />
              <Num label={t.capApport} value={apport} onChange={setApport} suffix="€" />
              <Num label={t.capRate} value={rate} onChange={setRate} suffix="%" step={0.1} />
              <Num label={t.capTerm} value={term} onChange={setTerm} suffix={t.yearsUnit} />
              <Num label={t.capLoanIns} value={loanInsPct} onChange={setLoanInsPct} suffix="%" step={0.01} />
              <Num label={t.capNotaire} value={notairePct} onChange={setNotairePct} suffix="%" step={0.1} />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">{t.capNote}</p>
          </div>

          {/* Result */}
          <div className="lg:sticky lg:top-6 h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.capMaxPrice}</div>
            {canBorrow ? (
              <>
                <div className="mt-1 text-3xl font-bold text-brand-800">{formatEUR(Math.round(r.maxPrice), locale)}</div>
                <div className="mt-4 space-y-2.5 text-sm">
                  <Row label={t.capBorrowing} value={formatEUR(Math.round(r.loan), locale)} />
                  <Row label={t.capMonthly} value={`${formatEUR(Math.round(r.maxAllIn), locale)} /mo`} />
                  <Row label={t.capApport} value={formatEUR(Math.round(apport), locale)} />
                  <Row label={t.capDebtRatio} value={`${r.debtRatio.toFixed(0)}%`} strong />
                </div>
                <a
                  href={`/calculateur?prix=${Math.round(r.maxPrice)}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  {t.capTestInvest}
                </a>
                <a
                  href={`/screener?maxm2=${Math.round(r.maxPrice / 50)}`}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {t.capSeeMarkets}
                </a>
              </>
            ) : (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-700">{t.capCantBorrow}</p>
            )}
          </div>
        </div>
      </main>
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
