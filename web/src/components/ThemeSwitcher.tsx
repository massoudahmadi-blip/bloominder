'use client';

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'editorial', name: 'Éditorial', color: '#0d9488' },
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'azur', name: 'Azur', color: '#2563eb' },
  { id: 'sunset', name: 'Sunset', color: '#ea580c' },
] as const;

const KEY = 'bloominder-theme';

export function ThemeSwitcher() {
  const [theme, setTheme] = useState('editorial');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || 'editorial';
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  const pick = (id: string) => {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
    setOpen(false);
  };

  const current = THEMES.find((x) => x.id === theme) ?? THEMES[0];

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Thème"
        aria-label="Thème"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 transition hover:bg-slate-50"
      >
        <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: current.color }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-panel">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Thème</div>
            {THEMES.map((x) => (
              <button
                key={x.id}
                onClick={() => pick(x.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                  theme === x.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: x.color }} />
                {x.name}
                {theme === x.id && (
                  <svg className="ml-auto h-4 w-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
