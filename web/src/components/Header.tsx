'use client';

import { SearchBar } from './SearchBar';
import { AddressSuggestion } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export function Header({ onLocate }: { onLocate: (s: AddressSuggestion) => void }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:gap-6 sm:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c1.9 1.4 2.7 3.2 2.7 4.7 0 1.6-1 2.9-2.7 3.4-1.7-.5-2.7-1.8-2.7-3.4C9.3 6.2 10.1 4.4 12 3Zm6.4 5.4c.4 2.3-.4 4.2-1.6 5.2-1.4 1.1-3 1-4.3-.2 0-1.8 1-3.2 2.5-3.8 1.5-.6 2.9-.6 3.4-1.2ZM5.6 8.4c.5.6 1.9.6 3.4 1.2 1.5.6 2.5 2 2.5 3.8-1.3 1.2-2.9 1.3-4.3.2-1.2-1-2-2.9-1.6-5.2ZM12 12.5c1 .7 1.5 1.7 1.5 2.7v6.3h-3v-6.3c0-1 .5-2 1.5-2.7Z" />
          </svg>
        </span>
        <div className="hidden sm:block">
          <div className="text-lg font-semibold leading-none tracking-tight">Bloominder</div>
          <div className="text-[11px] leading-tight text-slate-400">{t.tagline}</div>
        </div>
      </div>

      <nav className="hidden items-center gap-1 text-sm md:flex">
        <a href="/" className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-slate-100">{t.mapTab}</a>
        <a href="/screener" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.markets}</a>
        <a href="/calculateur" className="rounded-lg px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t.calculator}</a>
      </nav>

      <div className="max-w-xl flex-1">
        <SearchBar onLocate={onLocate} />
      </div>

      <div className="ml-auto flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
        {(['fr', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`rounded-full px-3 py-1.5 uppercase transition ${
              locale === l ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </header>
  );
}
