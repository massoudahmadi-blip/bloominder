'use client';

import { Sale } from '@/lib/types';
import { formatEUR, formatPriceM2, formatM2, formatDate, priceM2Color } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

export function ResultCard({
  sale,
  active,
  onClick,
}: {
  sale: Sale;
  active: boolean;
  onClick: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-2xl border bg-white p-4 text-left transition ${
        active ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900">{formatEUR(sale.prix, locale)}</div>
          {sale.prix_m2 != null && (
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: priceM2Color(sale.prix_m2) }}>
              <span className="h-2 w-2 rounded-full" style={{ background: priceM2Color(sale.prix_m2) }} />
              {formatPriceM2(sale.prix_m2, locale)}
            </div>
          )}
        </div>
        {sale.type && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            {(t as any)[sale.type] ?? sale.type}
          </span>
        )}
      </div>

      <div className="mt-2 truncate text-sm text-slate-600">
        {sale.adresse ? `${sale.adresse}, ` : ''}
        <span className="text-slate-400">
          {sale.code_postal} {sale.nom_commune}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {sale.surface_bati != null && (
          <span>
            {t.surface}: <span className="font-medium text-slate-700">{formatM2(sale.surface_bati)}</span>
          </span>
        )}
        {sale.nb_pieces != null && (
          <span>
            {t.rooms}: <span className="font-medium text-slate-700">{sale.nb_pieces}</span>
          </span>
        )}
        {sale.surface_terrain != null && sale.type !== 'Terrain' && (
          <span>
            {t.land}: <span className="font-medium text-slate-700">{formatM2(sale.surface_terrain)}</span>
          </span>
        )}
        <span className="ml-auto text-slate-400">{formatDate(sale.date, locale)}</span>
      </div>
    </button>
  );
}
