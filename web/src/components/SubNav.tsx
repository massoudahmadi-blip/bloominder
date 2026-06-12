'use client';

import { useI18n } from '@/lib/i18n';
import { ThemeSwitcher } from './ThemeSwitcher';

type Tab = 'map' | 'carte' | 'markets' | 'stats' | 'calculator' | 'capacity' | 'estimate' | 'methodo';

const LOGO = (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" />
  </svg>
);

/** Shared header for every non-map page so the nav never drifts. */
export function SubNav({ active }: { active: Tab }) {
  const { t, locale, setLocale } = useI18n();

  const links: { tab: Tab; href: string; label: string }[] = [
    { tab: 'map', href: '/', label: t.mapTab },
    { tab: 'carte', href: '/carte', label: t.choroNav },
    { tab: 'markets', href: '/screener', label: t.markets },
    { tab: 'stats', href: '/stats', label: t.navStats },
    { tab: 'calculator', href: '/calculateur', label: t.calculator },
    { tab: 'capacity', href: '/capacite', label: t.navCanIBuy },
    { tab: 'estimate', href: '/estimation', label: t.navEstimate },
    { tab: 'methodo', href: '/methodologie', label: t.navMethodo },
  ];

  return (
    <header className="z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
      <a href="/" className="flex shrink-0 items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">{LOGO}</span>
        <span className="hidden font-serif text-xl font-semibold tracking-tight sm:block">Bloominder</span>
      </a>
      <nav className="flex flex-wrap items-center gap-1 text-sm">
        {links.map((l) => (
          <a
            key={l.tab}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              l.tab === active ? 'text-brand-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ThemeSwitcher />
        <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
          {(['fr', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`rounded-full px-3 py-1.5 uppercase transition ${locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
