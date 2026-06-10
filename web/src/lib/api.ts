import type { Sale, BBox, Filters, YearTrend, CommuneRow, ScreenerParams, CommuneProfile } from './types';
import { mockSalesInView, mockComparables, mockTrend, mockScreener, mockCommune, mockCommuneTransactions } from './mock';

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
  // The API returns raw DB column names; map them to the frontend Sale shape.
  return (data.comparables ?? []).map((r: any): Sale => ({
    id: r.id,
    id_mutation: r.id_mutation,
    date: r.date_mutation,
    prix: Number(r.valeur_fonciere),
    type: r.type_local ?? null,
    prix_m2: r.prix_m2 != null ? Number(r.prix_m2) : null,
    adresse: r.adresse,
    nom_commune: r.nom_commune,
    surface_bati: r.surface_bati != null ? Number(r.surface_bati) : null,
    nb_pieces: r.nb_pieces ?? null,
    longitude: r.longitude ?? 0,
    latitude: r.latitude ?? 0,
  }));
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

export interface ScreenerResult {
  results: CommuneRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** City screener — ranked communes with metrics + investment scores. */
export async function getScreener(p: ScreenerParams): Promise<ScreenerResult> {
  if (USING_MOCK) {
    const results = mockScreener(p.sort, p.dir);
    return { results, total: results.length, page: 1, pageSize: results.length };
  }
  const sp = new URLSearchParams();
  if (p.dept) sp.set('dept', p.dept);
  if (p.minYield != null) sp.set('minYield', String(p.minYield));
  if (p.minScore != null) sp.set('minScore', String(p.minScore));
  if (p.q) sp.set('q', p.q);
  if (p.sort) sp.set('sort', p.sort);
  if (p.dir) sp.set('dir', p.dir);
  sp.set('page', String(p.page ?? 1));
  sp.set('pageSize', String(p.pageSize ?? 25));
  const res = await fetch(`${API}/api/screener?${sp.toString()}`);
  if (!res.ok) throw new Error(`screener ${res.status}`);
  return res.json();
}

/** Full city profile for the drill-down page. Returns null if the commune isn't found. */
export async function getCommune(code: string): Promise<CommuneProfile | null> {
  if (USING_MOCK) return mockCommune(code);
  const res = await fetch(`${API}/api/commune/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`commune ${res.status}`);
  return res.json();
}

/** Paginated list of a commune's individual transactions (drill-down). */
export async function getCommuneTransactions(
  code: string,
  page = 1,
): Promise<{ results: Sale[]; total: number; page: number; pageSize: number }> {
  if (USING_MOCK) return mockCommuneTransactions(code, page);
  const sp = new URLSearchParams({ codeCommune: code, page: String(page), pageSize: '20' });
  const res = await fetch(`${API}/api/search?${sp.toString()}`);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const d = await res.json();
  return {
    total: d.total,
    page: d.page,
    pageSize: d.pageSize,
    results: (d.results ?? []).map((r: any): Sale => ({
      id: r.id,
      id_mutation: r.id_mutation,
      date: r.date_mutation,
      prix: Number(r.valeur_fonciere),
      type: r.type_local ?? null,
      prix_m2: r.prix_m2 != null ? Number(r.prix_m2) : null,
      adresse: r.adresse,
      nom_commune: r.nom_commune,
      code_postal: r.code_postal,
      surface_bati: r.surface_bati != null ? Number(r.surface_bati) : null,
      nb_pieces: r.nb_pieces ?? null,
      longitude: r.longitude ?? 0,
      latitude: r.latitude ?? 0,
    })),
  };
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
