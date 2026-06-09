import type { Sale, BBox, Filters, YearTrend } from './types';
import { mockSalesInView, mockComparables, mockTrend } from './mock';

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
export const USING_MOCK = API === '';

function filterParams(f: Filters): string {
  const p = new URLSearchParams();
  if (f.type !== 'all') p.set('type', f.type);
  if (f.minPrice != null) p.set('minPrice', String(f.minPrice));
  if (f.maxPrice != null) p.set('maxPrice', String(f.maxPrice));
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  return p.toString();
}

/** Sales inside the current map viewport (powers both map markers and the list). */
export async function getSalesInView(bbox: BBox, filters: Filters): Promise<Sale[]> {
  if (USING_MOCK) return mockSalesInView(bbox, filters);
  const bb = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
  const url = `${API}/api/map?bbox=${bb}&limit=2000&${filterParams(filters)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`map ${res.status}`);
  const fc = await res.json();
  return (fc.features ?? []).map((feat: any, i: number): Sale => ({
    id: feat.properties.id ?? i,
    id_mutation: feat.properties.id_mutation,
    date: feat.properties.date,
    prix: feat.properties.prix,
    type: feat.properties.type ?? null,
    prix_m2: feat.properties.prix_m2 ?? null,
    longitude: feat.geometry.coordinates[0],
    latitude: feat.geometry.coordinates[1],
  }));
}

export async function getComparables(lat: number, lon: number, type?: string | null): Promise<Sale[]> {
  if (USING_MOCK) return mockComparables(lat, lon, type);
  const url = `${API}/api/comparables?lat=${lat}&lon=${lon}&radius=800${type ? `&type=${type}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`comparables ${res.status}`);
  const data = await res.json();
  return data.comparables ?? [];
}

export async function getTrend(codeCommune?: string, type?: string | null): Promise<YearTrend[]> {
  if (USING_MOCK) return mockTrend(codeCommune, type);
  if (!codeCommune) return [];
  const url = `${API}/api/stats/trend/${codeCommune}${type ? `?type=${type}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`trend ${res.status}`);
  const data = await res.json();
  return data.trend ?? [];
}

// --- French government address autocomplete (BAN) — free, no key, works in the browser. ---
export interface AddressSuggestion {
  label: string;
  lon: number;
  lat: number;
  citycode?: string;
  city?: string;
  postcode?: string;
}

export async function geocode(q: string): Promise<AddressSuggestion[]> {
  if (q.trim().length < 3) return [];
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=6&autocomplete=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? []).map((f: any): AddressSuggestion => ({
      label: f.properties.label,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      citycode: f.properties.citycode,
      city: f.properties.city,
      postcode: f.properties.postcode,
    }));
  } catch {
    return [];
  }
}
