'use client';

import { PRICE_BREAKS, PRICE_COLORS, NO_PRICE_COLOR } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function Legend() {
  const { t } = useI18n();
  const labels = [
    `< ${PRICE_BREAKS[0].toLocaleString('fr-FR')}`,
    ...PRICE_BREAKS.slice(0, -1).map((b, i) => `${b.toLocaleString('fr-FR')}–${PRICE_BREAKS[i + 1].toLocaleString('fr-FR')}`),
    `> ${PRICE_BREAKS[PRICE_BREAKS.length - 1].toLocaleString('fr-FR')}`,
  ];

  return (
    <div className="pointer-events-none absolute bottom-6 left-4 z-10 rounded-xl border border-slate-100 bg-white/95 px-3 py-2.5 text-[11px] shadow-panel backdrop-blur">
      <div className="mb-1.5 font-semibold text-slate-700">{t.legendTitle}</div>
      <div className="space-y-1">
        {PRICE_COLORS.map((c, i) => (
          <div key={c} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c }} />
            <span className="text-slate-500">{labels[i]} €</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: NO_PRICE_COLOR }} />
          <span className="text-slate-500">{t.legendNoData}</span>
        </div>
      </div>
    </div>
  );
}
