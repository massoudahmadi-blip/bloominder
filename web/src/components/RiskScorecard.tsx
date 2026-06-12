'use client';

import { useI18n } from '@/lib/i18n';

type Level = 'good' | 'warn' | 'bad' | 'neutral';
const COLORS: Record<Level, string> = { good: '#10b981', warn: '#f59e0b', bad: '#ef4444', neutral: '#94a3b8' };

export interface RiskInput {
  salePrice?: number | null;       // recorded sale price (address view)
  estimate?: number | null;        // AVM estimate
  daysToSell?: number | null;      // liquidity proxy (DPE → deed)
  dpe?: string | null;             // energy class A–G (address)
  passoirePct?: number | null;     // % F/G in the commune (commune view)
  seveso?: number | null;
  risksText?: string | null;
  priceM2Appt?: number | null;
  income?: number | null;
  growth1y?: number | null;
  strStrict?: boolean | null;   // short-term-rental strict tier
}

export function RiskScorecard(props: RiskInput) {
  const { t } = useI18n();
  const flags: { level: Level; label: string; detail: string }[] = [];

  if (props.salePrice && props.estimate) {
    const d = ((props.salePrice - props.estimate) / props.estimate) * 100;
    flags.push({
      level: d > 15 ? 'bad' : d > 5 ? 'warn' : 'good',
      label: t.riskPriceFair,
      detail: `${d > 0 ? '+' : ''}${d.toFixed(0)}% ${d > 2 ? t.riskAbove : d < -2 ? t.riskBelow : t.riskFair}`,
    });
  }
  if (props.daysToSell != null) {
    const x = props.daysToSell;
    flags.push({
      level: x < 120 ? 'good' : x <= 200 ? 'warn' : 'bad',
      label: t.riskLiquidity,
      detail: `${x} ${t.daysUnit} · ${t.riskLiqProxy}`,
    });
  }
  if (props.dpe) {
    const c = props.dpe.toUpperCase();
    flags.push({
      level: c === 'G' ? 'bad' : c === 'F' || c === 'E' ? 'warn' : 'good',
      label: `${t.riskDpe} (${c})`,
      detail: c === 'G' ? t.riskBan2025 : c === 'F' ? t.riskBan2028 : c === 'E' ? t.riskBan2034 : t.riskDpeOk,
    });
  } else if (props.passoirePct != null) {
    flags.push({
      level: props.passoirePct >= 40 ? 'bad' : props.passoirePct >= 25 ? 'warn' : 'good',
      label: t.riskDpe,
      detail: `${props.passoirePct}% ${t.riskPassoires}`,
    });
  }
  if (props.seveso != null || props.risksText != null) {
    const seveso = props.seveso ?? 0;
    flags.push({
      level: seveso > 0 ? 'bad' : props.risksText ? 'warn' : 'good',
      label: t.riskGeo,
      detail: seveso > 0 ? t.riskGeoSeveso : props.risksText ? props.risksText.slice(0, 80) : t.riskGeoNone,
    });
  }
  if (props.priceM2Appt && props.income) {
    const years = (props.priceM2Appt * 70) / props.income;
    flags.push({
      level: years < 8 ? 'good' : years <= 15 ? 'warn' : 'bad',
      label: t.riskAfford,
      detail: `${years.toFixed(1)} ${t.yearsUnit} ${t.riskOfIncome}`,
    });
  }
  if (props.growth1y != null) {
    const g = props.growth1y;
    flags.push({
      level: g > 0 ? 'good' : g > -5 ? 'warn' : 'bad',
      label: t.riskTrend,
      detail: `${g > 0 ? '+' : ''}${g}% ${t.riskOneYear}`,
    });
  }
  if (props.strStrict != null) {
    flags.push({
      level: props.strStrict ? 'warn' : 'good',
      label: t.riskStr,
      detail: props.strStrict ? t.riskStrStrict : t.riskStrOk,
    });
  }

  if (!flags.length) return null;
  const bad = flags.filter((f) => f.level === 'bad').length;
  const warn = flags.filter((f) => f.level === 'warn').length;

  return (
    <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.riskTitle}</h2>
        <span className="text-[11px] font-medium" style={{ color: bad ? COLORS.bad : warn ? COLORS.warn : COLORS.good }}>
          {bad ? `${bad} ⚑` : warn ? `${warn} ⚠` : '✓'}
        </span>
      </div>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {flags.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[f.level] }} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-700">{f.label}</div>
              <div className="truncate text-xs text-slate-500">{f.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-slate-400">{t.riskDisclaimer}</p>
    </section>
  );
}
