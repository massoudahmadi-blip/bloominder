'use client';

import { useEffect, useRef, useState } from 'react';
import { geocode, AddressSuggestion } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export function SearchBar({
  onLocate,
}: {
  onLocate: (s: AddressSuggestion) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (q.trim().length < 3) {
        setItems([]);
        return;
      }
      const res = await geocode(q);
      setItems(res);
      setOpen(res.length > 0);
      setActive(-1);
    }, 220);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (s: AddressSuggestion) => {
    setQ(s.label);
    setOpen(false);
    onLocate(s);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 shadow-sm transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <svg className="h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, items.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && active >= 0) choose(items[active]);
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={t.searchPlaceholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {open && (
        <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-100 bg-white py-1 shadow-panel">
          {items.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition ${
                  active === i ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 21s-6-5.7-6-10a6 6 0 1 1 12 0c0 4.3-6 10-6 10Z" />
                  <circle cx="12" cy="11" r="2" />
                </svg>
                <span>
                  <span className="block font-medium text-slate-800">{s.label}</span>
                  {s.postcode && <span className="text-xs text-slate-400">{s.postcode} {s.city}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
