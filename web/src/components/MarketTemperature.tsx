'use client';

import { useI18n } from '@/lib/i18n';

// A hot/balanced/cooling read blending price momentum (1-yr) and liquidity
// (days-to-sell proxy). Pure client-side from existing commune metrics.
export function MarketTemperature({ growth1y, daysToSell }: { growth1y?: number | null; daysToSell?: number | null }) {
  const { t } = useI18n();
  if (growth1y == null && daysToSell == null) return null;

  let temp = 50;
  if (growth1y != null) temp += Math.max(-25, Math.min(25, growth1y * 5));
  if (daysToSell != null) temp += daysToSell < 120 ? 15 : daysToSell <= 200 ? 0 : -15;
  temp = Math.max(3, Math.min(97, temp));

  const label = temp >= 66 ? t.tempHot : temp >= 40 ? t.tempBalanced : t.tempCool;
  const color = temp >= 66 ? '#ef4444' : temp >= 40 ? '#f59e0b' : '#0ea5e9';

  return (
    <section className="report-card rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.tempTitle}</h2>
        <span className="text-sm font-semibold" style={{ color }}>{label}</span>
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,#0ea5e9,#f59e0b,#ef4444)' }}>
        <div
          className="absolute -top-1 h-4.5 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-white"
          style={{ left: `${temp}%`, height: 18, background: '#0f172a' }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>{t.tempCool}</span><span>{t.tempBalanced}</span><span>{t.tempHot}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {growth1y != null && <>{growth1y > 0 ? '+' : ''}{growth1y}%/an</>}
        {growth1y != null && daysToSell != null && ' · '}
        {daysToSell != null && <>{daysToSell} {t.daysUnit} {t.tempToSell}</>}
      </p>
    </section>
  );
}
