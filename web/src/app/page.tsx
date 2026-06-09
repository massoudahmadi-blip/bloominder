'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { FilterBar } from '@/components/Filters';
import { PropertyMap } from '@/components/PropertyMap';
import { ResultsList } from '@/components/ResultsList';
import { PropertyPanel } from '@/components/PropertyPanel';
import { Sale, BBox, Filters } from '@/lib/types';
import { getSalesInView, USING_MOCK } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<Filters>({ type: 'all' });
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [focus, setFocus] = useState<{ lon: number; lat: number; key: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');

  useEffect(() => {
    if (!bbox) return;
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(() => {
      getSalesInView(bbox, filters)
        .then((res) => !cancelled && setSales(res))
        .catch(() => !cancelled && setSales([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [bbox, filters]);

  const selectFromList = (s: Sale) => {
    setSelected(s);
    setFocus({ lon: s.longitude, lat: s.latitude, key: Date.now() });
    setMobileTab('map');
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      <Header onLocate={(s) => setFocus({ lon: s.lon, lat: s.lat, key: Date.now() })} />

      {USING_MOCK && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-700">{t.demoBanner}</div>
      )}

      <FilterBar filters={filters} onChange={setFilters} />

      <main className="relative flex min-h-0 flex-1">
        {/* Results list */}
        <section
          className={`w-full shrink-0 border-r border-slate-200 bg-slate-50 lg:w-[420px] ${
            mobileTab === 'list' ? 'block' : 'hidden lg:block'
          }`}
        >
          <ResultsList
            sales={sales}
            loading={loading}
            selectedId={selected?.id ?? null}
            onSelect={selectFromList}
          />
        </section>

        {/* Map + detail panel */}
        <section className={`relative min-h-0 flex-1 ${mobileTab === 'map' ? 'block' : 'hidden lg:block'}`}>
          <PropertyMap
            sales={sales}
            selected={selected}
            focus={focus}
            onSelect={setSelected}
            onViewChange={setBbox}
          />
          <PropertyPanel sale={selected} onClose={() => setSelected(null)} />
        </section>

        {/* Mobile map/list toggle */}
        <div className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 lg:hidden">
          <div className="flex items-center rounded-full bg-slate-900 p-1 text-sm font-medium text-white shadow-panel">
            <button
              onClick={() => setMobileTab('map')}
              className={`rounded-full px-4 py-1.5 transition ${mobileTab === 'map' ? 'bg-white text-slate-900' : ''}`}
            >
              {t.mapTab}
            </button>
            <button
              onClick={() => setMobileTab('list')}
              className={`rounded-full px-4 py-1.5 transition ${mobileTab === 'list' ? 'bg-white text-slate-900' : ''}`}
            >
              {t.listTab}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
