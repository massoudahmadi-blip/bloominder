'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { FilterBar } from '@/components/Filters';
import { PropertyMap } from '@/components/PropertyMap';
import { PropertyPanel } from '@/components/PropertyPanel';
import { Sale, BBox, Filters } from '@/lib/types';
import { getSalesInView, getMeta, USING_MOCK } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>({ type: 'all' });
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; key: number } | null>(null);

  // Default the map to the last 6 months of available data.
  useEffect(() => {
    getMeta().then(({ maxDate }) => {
      if (!maxDate) return;
      const to = maxDate;
      const d = new Date(maxDate);
      d.setMonth(d.getMonth() - 6);
      const from = d.toISOString().slice(0, 10);
      setFilters((f) => (f.from || f.to ? f : { ...f, from, to }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bbox) return;
    let cancelled = false;
    const h = setTimeout(() => {
      getSalesInView(bbox, filters)
        .then((res) => !cancelled && setSales(res))
        .catch(() => !cancelled && setSales([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [bbox, filters]);

  const locateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setFocus({ lon: pos.coords.longitude, lat: pos.coords.latitude, key: Date.now() }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      <Header onLocate={(s) => setFocus({ lon: s.lon, lat: s.lat, key: Date.now() })} />

      {USING_MOCK && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700">{t.demoBanner}</div>
      )}

      <FilterBar filters={filters} onChange={setFilters} />

      <main className="relative min-h-0 flex-1">
        <PropertyMap
          sales={sales}
          selected={selected}
          focus={focus}
          onSelect={setSelected}
          onViewChange={setBbox}
        />
        <button
          onClick={locateMe}
          title={t.nearMe}
          className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-panel transition hover:bg-slate-50"
        >
          <svg className="h-4 w-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          </svg>
          {t.nearMe}
        </button>
        <PropertyPanel sale={selected} onClose={() => setSelected(null)} />
      </main>
    </div>
  );
}
