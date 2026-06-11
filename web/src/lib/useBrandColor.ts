'use client';

import { useEffect, useState } from 'react';

const FALLBACK: Record<string, string> = { '400': 'rgb(45,212,191)', '600': 'rgb(13,148,136)', '700': 'rgb(15,118,110)' };

/**
 * Reads the active theme's brand colour (CSS var --brand-<shade>) as an
 * rgb() string, and updates when the theme changes. For JS-driven colours
 * (MapLibre paint, SVG charts) that can't use Tailwind classes.
 */
export function useBrandColor(shade: '400' | '600' | '700' = '600'): string {
  const [color, setColor] = useState(FALLBACK[shade] ?? FALLBACK['600']);

  useEffect(() => {
    const read = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(`--brand-${shade}`).trim();
      if (v) setColor(`rgb(${v.split(/\s+/).join(',')})`);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [shade]);

  return color;
}
