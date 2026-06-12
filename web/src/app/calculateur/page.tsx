'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';
import { exportCalculatorXlsx } from '@/lib/excel';
import { AreaChart, CashflowBars } from '@/components/Charts';
import { useBrandColor } from '@/lib/useBrandColor';

function irr(cfs: number[]): number | null {
  const npv = (rate: number) => cfs.reduce((s, cf, i) => s + cf / Math.pow(1 + rate, i), 0);
  let lo = -0.9, hi = 1, flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2, f = npv(mid);
    if (Math.abs(f) < 1) return mid;
    if (flo * f < 0) hi = mid; else { lo = mid; flo = f; }
  }
  return (lo + hi) / 2;
}

type SimInput = {
  price: number; notairePct: number; works: number; furnishing: number; rent: number;
  taxe: number; copro: number; mgmtPct: number; insurance: number; vacancyPct: number;
  loanInsPct: number; capexPct: number;
  down: number; rate: number; term: number; holdYears: number; rentGrowth: number;
  appreciation: number; sellCosts: number; tmi: number; regime: 'nu' | 'lmnp';
};

export interface ScheduleRow {
  year: number; rent: number; interest: number; principal: number; balance: number; tax: number; cashflow: number;
}

// French capital-gains (plus-value immobilière) abatement schedules — secondary
// residence. Income-tax (19%) exempt after 22y; social levies (17.2%) after 30y.
function abatIR(y: number): number { return y <= 5 ? 0 : y >= 22 ? 100 : 6 * (y - 5); }
function abatSocial(y: number): number {
  if (y <= 5) return 0;
  if (y >= 30) return 100;
  if (y <= 21) return 1.65 * (y - 5);
  return y === 22 ? 28 : 28 + 9 * (y - 22);
}
// Surtaxe on high taxable IR gains (>50k), simplified flat-on-total bands.
function surtaxePV(g: number): number {
  if (g <= 50000) return 0;
  const r = g <= 100000 ? 0.02 : g <= 150000 ? 0.03 : g <= 200000 ? 0.04 : g <= 250000 ? 0.05 : 0.06;
  return g * r;
}

// Full investment simulation: yields, cashflow, banker ratios, amortization,
// IRR, capital-gains tax on exit (incl. LMNP amortization reintegration), and
// the minimum holding period to break even.
function simulate(p: SimInput) {
  const notaire = p.price * (p.notairePct / 100);
  const total = p.price + notaire + p.works + p.furnishing;
  const loan = Math.max(0, total - p.down);
  const mr = p.rate / 100 / 12;
  const n = p.term * 12;
  const payment = loan <= 0 ? 0 : mr === 0 ? loan / n : (loan * mr) / (1 - Math.pow(1 + mr, -n));
  const loanInsM = loan * (p.loanInsPct / 100) / 12;   // assurance emprunteur (on initial capital)
  const capexM = p.price * (p.capexPct / 100) / 12;    // provision travaux / CapEx reserve
  const debtServiceM = payment + loanInsM;
  const opCostM = p.taxe / 12 + p.copro + p.rent * (p.mgmtPct / 100) + p.insurance + p.rent * (p.vacancyPct / 100) + capexM;
  const monthlyCharges = opCostM;
  const netOpsM = p.rent - opCostM;
  const cashflowM = netOpsM - debtServiceM;
  const grossYield = total > 0 ? (p.rent * 12) / total * 100 : 0;
  const netYield = total > 0 ? (netOpsM * 12) / total * 100 : 0;
  const coc = p.down > 0 ? (cashflowM * 12) / p.down * 100 : 0;
  const dscr = debtServiceM > 0 ? (netOpsM * 12) / (debtServiceM * 12) : null;
  const fixedOutflowM = p.taxe / 12 + p.copro + p.insurance + capexM + p.rent * (p.mgmtPct / 100) + debtServiceM;
  const breakEvenOcc = p.rent > 0 ? Math.min(150, (fixedOutflowM / p.rent) * 100) : null;

  const abatement = p.regime === 'lmnp' ? 0.5 : 0.3; // micro income-tax allowance during holding
  const taxRate = p.tmi / 100 + 0.172;
  const acquisition = p.price + notaire + p.works;
  const depreciableBase = p.price * 0.85; // building portion (land ~15% non-depreciable)

  // Capital-gains tax if sold at year y.
  const plusValue = (y: number) => {
    const saleNet = p.price * Math.pow(1 + p.appreciation / 100, y) * (1 - p.sellCosts / 100);
    let base = Math.max(0, saleNet - acquisition);
    if (p.regime === 'lmnp') base += depreciableBase * Math.min(y, 30) / 30; // LF2025: amortization reintegrated
    const taxableIR = base * (1 - abatIR(y) / 100);
    const taxableSoc = base * (1 - abatSocial(y) / 100);
    const tax = Math.max(0, taxableIR * 0.19 + taxableSoc * 0.172 + surtaxePV(taxableIR));
    return { saleNet, tax };
  };

  // Operating cashflow per year (after income tax, insurance, CapEx) up to a
  // 30-year horizon, so we can scan for the break-even holding period.
  const HORIZON = Math.max(p.holdYears, 30);
  const op: number[] = []; const balAt: number[] = [];
  const schedule: ScheduleRow[] = [];
  let rentM = p.rent;
  let bal = loan;
  for (let y = 1; y <= HORIZON; y++) {
    let interestY = 0, principalY = 0;
    for (let m = 0; m < 12; m++) {
      const interest = bal * mr;
      const princ = Math.min(bal, Math.max(0, payment - interest));
      interestY += interest; principalY += princ; bal = Math.max(0, bal - princ);
    }
    const annualRent = rentM * 12;
    const incomeTax = Math.max(0, annualRent * (1 - abatement)) * taxRate;
    const opCF = annualRent - opCostM * 12 - payment * 12 - loanInsM * 12 - incomeTax;
    op[y] = opCF; balAt[y] = bal;
    if (y <= p.holdYears) {
      const exit = y === p.holdYears ? plusValue(y).saleNet - bal - plusValue(y).tax : 0;
      schedule.push({
        year: y, rent: Math.round(annualRent), interest: Math.round(interestY),
        principal: Math.round(principalY), balance: Math.round(bal), tax: Math.round(incomeTax),
        cashflow: Math.round(opCF + exit),
      });
    }
    rentM *= 1 + p.rentGrowth / 100;
  }

  const pvH = plusValue(p.holdYears);
  const exitProceeds = pvH.saleNet - balAt[p.holdYears] - pvH.tax;
  const cfs: number[] = [-p.down];
  for (let y = 1; y <= p.holdYears; y++) cfs.push(op[y] + (y === p.holdYears ? exitProceeds : 0));
  const irrDec = irr(cfs);
  const totalProfit = cfs.reduce((s, c) => s + c, 0);

  // Minimum years to break even (recoup the cash invested), scanning up to 30y.
  let breakEvenYears: number | null = null;
  let cum = -p.down;
  for (let y = 1; y <= HORIZON; y++) {
    cum += op[y];
    const pv = plusValue(y);
    if (cum + pv.saleNet - balAt[y] - pv.tax >= 0) { breakEvenYears = y; break; }
  }

  const exitValue = p.price * Math.pow(1 + p.appreciation / 100, p.holdYears);
  const netCfM = op[1] / 12;
  return {
    notaire, total, loan, payment, loanInsM, capexM, monthlyCharges, cashflowM, grossYield, netYield, coc,
    dscr, breakEvenOcc, irrPct: irrDec != null ? irrDec * 100 : null,
    exitValue, exitProceeds, plusValueTax: pvH.tax, breakEvenYears, totalProfit, netCfM, schedule,
  };
}

const SENS_RATES = [2.5, 3, 3.5, 4, 4.5];
const SENS_APPRECS = [0, 1, 2, 3];

export default function CalculatorPage() {
  const { t, locale } = useI18n();
  usePageTitle(t.calculator);
  const brand = useBrandColor();

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
  const [capexPct, setCapexPct] = useState(0.5);
  // Financing
  const [down, setDown] = useState(30000);
  const [rate, setRate] = useState(3.5);
  const [term, setTerm] = useState(20);
  const [loanInsPct, setLoanInsPct] = useState(0.34);
  // Projection & tax
  const [holdYears, setHoldYears] = useState(10);
  const [rentGrowth, setRentGrowth] = useState(1.5);
  const [appreciation, setAppreciation] = useState(1.5);
  const [sellCosts, setSellCosts] = useState(6);
  const [tmi, setTmi] = useState(30);
  const [regime, setRegime] = useState<'nu' | 'lmnp'>('nu');

  // Pre-fill from a city profile link: /calculateur?prix=...&loyer=...
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const prix = Number(p.get('prix'));
    const loyer = Number(p.get('loyer'));
    if (prix > 0) setPrice(Math.round(prix));
    if (loyer > 0) setRent(Math.round(loyer));
  }, []);

  const input: SimInput = {
    price, notairePct, works, furnishing, rent, taxe, copro, mgmtPct, insurance,
    vacancyPct, capexPct, loanInsPct, down, rate, term, holdYears, rentGrowth, appreciation, sellCosts, tmi, regime,
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sim = useMemo(() => simulate(input), Object.values(input));
  const r = sim;
  const proj = sim;

  // IRR sensitivity grid: financing rate × annual appreciation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sens = useMemo(
    () => SENS_RATES.map((rt) => ({
      rate: rt,
      cells: SENS_APPRECS.map((ap) => simulate({ ...input, rate: rt, appreciation: ap }).irrPct),
    })),
    Object.values(input),
  );

  const downloadExcel = () => {
    exportCalculatorXlsx({
      fileName: `bloominder-rendement-${new Date().toISOString().slice(0, 10)}.xlsx`,
      title: t.calcTitle,
      generatedLabel: `${t.xlsGenerated} ${new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}`,
      disclaimer: t.xlsDisclaimer,
      model: {
        price, notairePct, works, furnishing, rent, taxe, copro, mgmtPct, insurance,
        vacancyPct, down, rate, term, holdYears, rentGrowth, appreciation, sellCosts, tmi,
        abatement: regime === 'lmnp' ? 0.5 : 0.3,
      },
      results: {
        notaire: sim.notaire, total: sim.total, loan: sim.loan, payment: sim.payment,
        monthlyCharges: sim.monthlyCharges, grossYield: sim.grossYield, netYield: sim.netYield,
        coc: sim.coc, dscr: sim.dscr, breakEvenOcc: sim.breakEvenOcc, cashflowM: sim.cashflowM,
        exitValueNet: sim.exitValue * (1 - sellCosts / 100), totalProfit: sim.totalProfit, irrPct: sim.irrPct,
      },
      schedule: sim.schedule,
      labels: {
        editableHint: t.xlsEditable,
        sInputs: t.xlsInputs, sResults: t.xlsResults, sSchedule: t.xlsSchedule,
        iPrice: t.fPrice, iNotaire: t.fNotaire, iWorks: t.fWorks, iFurnishing: t.fFurnishing,
        iRent: t.fRent, iTaxe: t.fTaxe, iCopro: t.fCopro, iMgmt: t.fMgmt, iInsurance: t.fInsurance,
        iVacancy: t.fVacancy, iDown: t.fDown, iRate: t.fRate, iTerm: t.fTerm, iHolding: t.fHolding,
        iRentGrowth: t.fRentGrowth, iAppreciation: t.fAppreciation, iSellingCosts: t.fSellingCosts,
        iTmi: t.fTMI, iAbatement: t.xlsAbatement,
        rNotaire: t.fNotaire, rTotal: t.rTotalCost, rLoan: t.rLoan, rPayment: t.rPayment,
        rChargesM: t.rChargesM, rGross: t.rGross, rNet: t.rNet, rCoC: t.rCoC, rDSCR: t.rDSCR,
        rBreakeven: t.rBreakeven, rCashflowM: t.rCashflowM, rExitValue: t.rExitValue,
        rTotalProfit: t.rTotalProfit, rIRR: t.rIRR,
        cYear: t.colYear, cRent: t.colRentAnnual, cInterest: t.colInterest, cPrincipal: t.colPrincipal,
        cBalance: t.colBalance, cTax: t.colTaxYr, cCashflow: t.rCashflowY,
        uYear: t.yearsUnit, uMonth: t.xlsPerMonth,
      },
    });
  };

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SubNav active="calculator" />

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
              <Num label={t.fCapex} value={capexPct} onChange={setCapexPct} suffix="%" step={0.1} />
            </Section>
            <Section title={t.secFinancing}>
              <Num label={t.fDown} value={down} onChange={setDown} suffix="€" />
              <Num label={t.fRate} value={rate} onChange={setRate} suffix="%" step={0.1} />
              <Num label={t.fTerm} value={term} onChange={setTerm} suffix="ans" />
              <Num label={t.fLoanIns} value={loanInsPct} onChange={setLoanInsPct} suffix="%" step={0.01} />
            </Section>
            <Section title={t.secProjection}>
              <Num label={t.fHolding} value={holdYears} onChange={setHoldYears} suffix="ans" />
              <Num label={t.fRentGrowth} value={rentGrowth} onChange={setRentGrowth} suffix="%" step={0.1} />
              <Num label={t.fAppreciation} value={appreciation} onChange={setAppreciation} suffix="%" step={0.1} />
              <Num label={t.fSellingCosts} value={sellCosts} onChange={setSellCosts} suffix="%" step={0.5} />
              <Num label={t.fTMI} value={tmi} onChange={setTmi} suffix="%" step={1} />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-500">{t.fRegime}</span>
                <select value={regime} onChange={(e) => setRegime(e.target.value as 'nu' | 'lmnp')}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400">
                  <option value="nu">{t.regimeNu}</option>
                  <option value="lmnp">{t.regimeLMNP}</option>
                </select>
              </label>
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
              <Row label={t.rDSCR} value={sim.dscr != null ? sim.dscr.toFixed(2) : '—'} />
              <Row label={t.rBreakeven} value={sim.breakEvenOcc != null ? `${sim.breakEvenOcc.toFixed(0)}%` : '—'} />
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

              <div className="my-2 border-t border-slate-100" />
              <Row label={t.rNetCashflowM} value={formatEUR(Math.round(proj.netCfM), locale)} />
              <div className="mt-1 flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: proj.netCfM >= 0 ? '#ecfdf5' : '#fff7ed' }}>
                <span className="text-slate-600">{t.rOutOfPocket}</span>
                <span className="text-base font-bold" style={{ color: proj.netCfM >= 0 ? '#059669' : '#ea580c' }}>
                  {proj.netCfM >= 0 ? `0 € · ${t.selfFunded}` : `${formatEUR(Math.round(-proj.netCfM), locale)} /mo`}
                </span>
              </div>
              <Row label={t.rExitValue} value={formatEUR(Math.round(proj.exitValue), locale)} />
              <Row label={t.rPlusValueTax} value={`− ${formatEUR(Math.round(sim.plusValueTax), locale)}`} />
              <Row label={t.rExitNet} value={formatEUR(Math.round(sim.exitProceeds), locale)} />
              <Row label={t.rTotalProfit} value={formatEUR(Math.round(proj.totalProfit), locale)} strong />
              <Row label={`${t.rIRR} · ${holdYears}a`} value={proj.irrPct != null ? `${proj.irrPct.toFixed(1)}%` : '—'} strong />
              <div className="mt-2 flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: sim.breakEvenYears != null && sim.breakEvenYears <= holdYears ? '#ecfdf5' : '#fff7ed' }}>
                <span className="text-slate-600">{t.rBreakEvenYears}</span>
                <span className="text-base font-bold" style={{ color: sim.breakEvenYears != null && sim.breakEvenYears <= holdYears ? '#059669' : '#ea580c' }}>
                  {sim.breakEvenYears != null ? `${sim.breakEvenYears} ${t.yearsUnit}` : `> 30 ${t.yearsUnit}`}
                </span>
              </div>
            </div>

            <button
              onClick={downloadExcel}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t.downloadExcel}
            </button>
          </div>
        </div>

        {/* IRR sensitivity grid */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.sensTitle}</h2>
          <p className="mb-3 text-xs text-slate-500">{t.sensSubtitle}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-center text-sm">
              <thead>
                <tr className="text-xs text-slate-400">
                  <th className="p-2 text-left font-medium">{t.sensRateLabel} \ {t.sensApprecLabel}</th>
                  {SENS_APPRECS.map((ap) => <th key={ap} className="p-2 font-medium">{ap}%</th>)}
                </tr>
              </thead>
              <tbody>
                {sens.map((row) => (
                  <tr key={row.rate} className="border-t border-slate-50">
                    <td className="p-2 text-left font-medium text-slate-600">{row.rate}%</td>
                    {row.cells.map((v, j) => (
                      <td key={j} className="p-2">
                        <span
                          className="inline-block min-w-[48px] rounded-md px-2 py-1 text-xs font-semibold"
                          style={{
                            background: v == null ? '#f1f5f9' : v >= 8 ? '#d1fae5' : v >= 4 ? '#fef9c3' : '#fee2e2',
                            color: v == null ? '#94a3b8' : v >= 8 ? '#047857' : v >= 4 ? '#a16207' : '#b91c1c',
                          }}
                        >
                          {v != null ? `${v.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Projection charts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.chartEquity}</h2>
            <AreaChart data={sim.schedule.map((s) => ({ label: String(s.year), value: Math.round(price * Math.pow(1 + appreciation / 100, s.year) - s.balance) }))} unit=" €" color={brand} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{t.chartCashflow}</h2>
            <CashflowBars data={sim.schedule.map((s) => ({ label: String(s.year), value: Math.round(s.cashflow - (s.year === holdYears ? sim.exitProceeds : 0)) }))} />
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
