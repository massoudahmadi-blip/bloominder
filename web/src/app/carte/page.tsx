'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { SubNav } from '@/components/SubNav';
import { usePageTitle } from '@/lib/useTitle';
import { ChoroplethMap } from '@/components/ChoroplethMap';

export default function CartePage() {
  const { t, locale } = useI18n();
  usePageTitle(t.choroTitle);
  const [level, setLevel] = useState<'dept' | 'region'>('dept');
  const [metric, setMetric] = useState<'price' | 'rent'>('price');
  const [ptype, setPtype] = useState<'maison' | 'appartement'>('appartement');

  const unit = metric === 'price' ? '€/m²' : `€/m²${t.xlsPerMonth}`;

  return (
    <div className="flex h-[100dvh] flex-col">
      <SubNav active="carte" />
      <div className="z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
        <span className="text-sm font-semibold text-slate-700">{t.choroTitle}</span>
        <Toggle value={metric} onChange={(v) => setMetric(v as 'price' | 'rent')}
          options={[['price', t.choroPrice], ['rent', t.choroRent]]} />
        <Toggle value={ptype} onChange={(v) => setPtype(v as 'maison' | 'appartement')}
          options={[['appartement', t.choroAppt], ['maison', t.choroMaison]]} />
        <Toggle value={level} onChange={(v) => setLevel(v as 'dept' | 'region')}
          options={[['dept', t.choroDept], ['region', t.choroRegion]]} />
        <span className="ml-auto hidden text-xs text-slate-400 sm:block">{t.choroHint}</span>
      </div>
      <main className="relative min-h-0 flex-1">
        <ChoroplethMap level={level} metric={metric} ptype={ptype} locale={locale} unit={unit} />
      </main>
    </div>
  );
}

function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${value === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
