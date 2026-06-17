'use client';

import { useI18n } from '@/lib/i18n';

type Sig = { label: string; kind: 'good' | 'bad' };

export function InvestorVerdict({
  score, yieldPct, growth1y, daysToSell, passoirePct, priceM2, income, sales12m, zoneTendue,
}: {
  score: number | null;
  yieldPct: number | null;
  growth1y: number | null;
  daysToSell: number | null;
  passoirePct: number | null;
  priceM2: number | null;
  income: number | null;
  sales12m: number | null;
  zoneTendue?: boolean;
}) {
  const { t } = useI18n();

  const pos: Sig[] = [];
  const neg: Sig[] = [];

  if (yieldPct != null) {
    if (yieldPct >= 6) pos.push({ label: t.vYieldHigh, kind: 'good' });
    else if (yieldPct >= 4.5) pos.push({ label: t.vYieldGood, kind: 'good' });
    else if (yieldPct < 3.5) neg.push({ label: t.vYieldLow, kind: 'bad' });
  }
  if (growth1y != null) {
    if (growth1y >= 3) pos.push({ label: t.vGrowthUp, kind: 'good' });
    else if (growth1y <= -3) neg.push({ label: t.vGrowthDown, kind: 'bad' });
  }
  if (daysToSell != null) {
    if (daysToSell <= 90) pos.push({ label: t.vLiquid, kind: 'good' });
    else if (daysToSell >= 180) neg.push({ label: t.vIlliquid, kind: 'bad' });
  }
  if (passoirePct != null) {
    if (passoirePct >= 15) neg.push({ label: t.vDpeRisk, kind: 'bad' });
    else if (passoirePct <= 7) pos.push({ label: t.vDpeHealthy, kind: 'good' });
  }
  // Affordability: cost of a representative 60 m² flat vs annual income.
  if (priceM2 != null && income != null && income > 0) {
    const ratio = (priceM2 * 60) / income;
    if (ratio <= 4) pos.push({ label: t.vAffordable, kind: 'good' });
    else if (ratio >= 8) neg.push({ label: t.vExpensive, kind: 'bad' });
  }
  if (sales12m != null && sales12m >= 150) pos.push({ label: t.vDemand, kind: 'good' });
  if (zoneTendue) neg.push({ label: t.vTendue, kind: 'bad' });

  // Tone: score-led, downgraded when serious red flags pile up.
  const serious = neg.length;
  let tone: 'good' | 'mixed' | 'caution';
  if ((score ?? 0) >= 65 && serious <= 1) tone = 'good';
  else if ((score ?? 0) >= 45 && serious <= 2) tone = 'mixed';
  else tone = 'caution';

  const toneCfg = {
    good: { label: t.verdictFavorable, bar: '#10b981', bg: 'linear-gradient(135deg,#ecfdf5,#f0fdfa)', dot: '#10b981' },
    mixed: { label: t.verdictBalanced, bar: '#f59e0b', bg: 'linear-gradient(135deg,#fffbeb,#fefce8)', dot: '#f59e0b' },
    caution: { label: t.verdictCaution, bar: '#ef4444', bg: 'linear-gradient(135deg,#fef2f2,#fff1f2)', dot: '#ef4444' },
  }[tone];

  const chips = [...pos, ...neg];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-panel">
      <div className="flex items-stretch">
        <div className="w-1.5 shrink-0" style={{ background: toneCfg.bar }} />
        <div className="flex-1 p-5" style={{ background: toneCfg.bg }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: toneCfg.dot }} />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.verdictTitle}</span>
            </div>
            {score != null && (
              <span className="text-sm font-medium text-slate-500">
                {t.scoreGlobalLbl} <b className="text-slate-800">{Math.round(score)}</b>/100
              </span>
            )}
          </div>
          <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{toneCfg.label}</p>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: c.kind === 'good' ? '#d1fae5' : '#fee2e2',
                    color: c.kind === 'good' ? '#047857' : '#b91c1c',
                  }}
                >
                  <span aria-hidden>{c.kind === 'good' ? '↑' : '↓'}</span>
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
