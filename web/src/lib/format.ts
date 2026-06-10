import type { PropertyType } from './types';

export function formatEUR(value: number | null | undefined, locale = 'fr'): string {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatM2(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(value))} m²`;
}

export function formatPriceM2(value: number | null | undefined, locale = 'fr'): string {
  if (value == null) return '—';
  return `${formatEUR(value, locale)}/m²`;
}

export function formatDate(iso: string, locale = 'fr'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

export function formatYear(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.getFullYear().toString();
}

// Color scale by €/m² — shared by map markers (as a step expression) and the legend/cards.
export const PRICE_BREAKS = [2000, 3500, 5000, 7000];
export const PRICE_COLORS = ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
export const NO_PRICE_COLOR = '#94a3b8';

export function priceM2Color(v: number | null | undefined): string {
  if (v == null) return NO_PRICE_COLOR;
  for (let i = 0; i < PRICE_BREAKS.length; i++) {
    if (v < PRICE_BREAKS[i]) return PRICE_COLORS[i];
  }
  return PRICE_COLORS[PRICE_COLORS.length - 1];
}

export const PROPERTY_TYPES: PropertyType[] = ['Maison', 'Appartement', 'Terrain', 'Local'];
