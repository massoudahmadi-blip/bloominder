import type { Sale, BBox, Filters, YearTrend, CommuneRow, ScreenerParams, CommuneProfile, NewsItem, StatsData } from './types';
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
  if (f.minSurface != null) p.set('surfaceMin', String(f.minSurface));
  if (f.maxSurface != null) p.set('surfaceMax', String(f.maxSurface));
  if (f.minLand != null) p.set('landMin', String(f.minLand));
  if (f.maxLand != null) p.set('landMax', String(f.maxLand));
  if (f.dpe) p.set('dpe', f.dpe);
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
    adresse: feat.properties.adresse ?? undefined,
    nom_commune: feat.properties.nom_commune ?? undefined,
    code_commune: feat.properties.code_commune ?? undefined,
    surface_bati: feat.properties.surface_bati ?? null,
    surface_terrain: feat.properties.surface_terrain ?? null,
    nb_pieces: feat.properties.nb_pieces ?? null,
    resale_pct: feat.properties.resale_pct ?? null,
    resale_prev_date: feat.properties.resale_prev_date ?? null,
    dpe: feat.properties.dpe ?? null,
    longitude: feat.geometry.coordinates[0],
    latitude: feat.geometry.coordinates[1],
  }));
}

export async function getComparables(lat: number, lon: number, type?: string | null, months = 24): Promise<Sale[]> {
  if (USING_MOCK) return mockComparables(lat, lon, type);
  const url = `${API}/api/comparables?lat=${lat}&lon=${lon}&radius=800&months=${months}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
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

export interface RentControl {
  controlled: boolean;
  zone?: string; city?: string; rooms?: number; furnished?: boolean;
  ref?: number | null; majored?: number; minored?: number; year?: number;
}

/** Rent-control reference rents for an address (encadrement des loyers). */
export async function getRentControl(lat: number, lon: number, rooms?: number | null, furnished?: boolean): Promise<RentControl> {
  if (USING_MOCK) return { controlled: false };
  const sp = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (rooms) sp.set('rooms', String(Math.min(4, rooms)));
  if (furnished != null) sp.set('furnished', String(furnished));
  try {
    const res = await fetch(`${API}/api/rent-control?${sp.toString()}`);
    if (!res.ok) return { controlled: false };
    return res.json();
  } catch {
    return { controlled: false };
  }
}

export interface ChoroPoint { code: string; value: number }

/** Choropleth values by région/département/commune for price (€/m²) or rent (€/m²/mo), by type. */
export async function getChoropleth(level: 'region' | 'dept' | 'commune', metric: 'price' | 'rent', ptype: 'maison' | 'appartement' = 'appartement', dept?: string): Promise<ChoroPoint[]> {
  if (USING_MOCK) return [];
  try {
    const res = await fetch(`${API}/api/choropleth?level=${level}&metric=${metric}&ptype=${ptype}${dept ? `&dept=${dept}` : ''}`);
    if (!res.ok) return [];
    const d = await res.json();
    return d.values ?? [];
  } catch {
    return [];
  }
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
  if (p.postal) sp.set('postal', p.postal);
  if (p.minYield != null) sp.set('minYield', String(p.minYield));
  if (p.minScore != null) sp.set('minScore', String(p.minScore));
  if (p.maxPriceM2 != null) sp.set('maxPriceM2', String(p.maxPriceM2));
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
      surface_terrain: r.surface_terrain != null ? Number(r.surface_terrain) : null,
      nb_pieces: r.nb_pieces != null ? Number(r.nb_pieces) : null,
      dpe: r.dpe ?? null,
      longitude: r.longitude != null ? Number(r.longitude) : 0,
      latitude: r.latitude != null ? Number(r.latitude) : 0,
    })),
  };
}

/** National DVF statistics + top-10s for the /stats page. */
export async function getStats(): Promise<StatsData> {
  if (USING_MOCK) {
    return {
      totals: { ventes: 30654017, volume: 4.2e12, communes: 34900, min_date: '2014-01-01', max_date: '2025-12-31' },
      byType: [
        { type: 'Maison', ventes: 9800000, median_m2: 2100 },
        { type: 'Appartement', ventes: 8200000, median_m2: 3600 },
        { type: 'Terrain/Autre', ventes: 7100000, median_m2: null },
        { type: 'Local', ventes: 900000, median_m2: 2500 },
      ],
      byDept: [
        { dept: '13', ventes: 620000, volume: 9.1e10, median_m2: 2900 },
        { dept: '75', ventes: 410000, volume: 1.8e11, median_m2: 10500 },
        { dept: '33', ventes: 380000, volume: 5.2e10, median_m2: 3400 },
      ],
      byYear: [
        { annee: 2020, ventes: 2400000, volume: 3.2e11, median_m2: 2600 },
        { annee: 2021, ventes: 2750000, volume: 3.9e11, median_m2: 2800 },
        { annee: 2022, ventes: 2680000, volume: 4.0e11, median_m2: 2950 },
        { annee: 2023, ventes: 2200000, volume: 3.4e11, median_m2: 2900 },
        { annee: 2024, ventes: 2050000, volume: 3.1e11, median_m2: 2850 },
        { annee: 2025, ventes: 2100000, volume: 3.2e11, median_m2: 2880 },
      ],
      byMonth: [
        { mois: 1, ventes: 180000 }, { mois: 2, ventes: 170000 }, { mois: 3, ventes: 210000 },
        { mois: 4, ventes: 220000 }, { mois: 5, ventes: 235000 }, { mois: 6, ventes: 260000 },
        { mois: 7, ventes: 250000 }, { mois: 8, ventes: 200000 }, { mois: 9, ventes: 245000 },
        { mois: 10, ventes: 240000 }, { mois: 11, ventes: 215000 }, { mois: 12, ventes: 230000 },
      ],
      priceBands: [
        { ord: 1, label: '< 100 k€', ventes: 6200000 },
        { ord: 2, label: '100–200 k€', ventes: 9100000 },
        { ord: 3, label: '200–300 k€', ventes: 6400000 },
        { ord: 4, label: '300–500 k€', ventes: 5200000 },
        { ord: 5, label: '500 k–1 M€', ventes: 2600000 },
        { ord: 6, label: '> 1 M€', ventes: 900000 },
      ],
      affordability: {
        best: [{ code_commune: '42218', nom_commune: 'Saint-Étienne', code_departement: '42', years: 3.1 }],
        worst: [{ code_commune: '75056', nom_commune: 'Paris', code_departement: '75', years: 22.4 }],
      },
      liquidity: {
        fastest: [{ code_commune: '69123', nom_commune: 'Lyon', code_departement: '69', days: 96 }],
        slowest: [{ code_commune: '2A004', nom_commune: 'Ajaccio', code_departement: '2A', days: 280 }],
        national_median: 165,
      },
      topSales: [
        { code_commune: '13055', nom_commune: 'Marseille', code_departement: '13', ventes_total: 120000 },
        { code_commune: '06088', nom_commune: 'Nice', code_departement: '06', ventes_total: 88000 },
      ],
      topVolume: [
        { code_commune: '75056', nom_commune: 'Paris', code_departement: '75', volume_total: 1.6e11 },
      ],
      topTurnover: [
        { code_commune: '06088', nom_commune: 'Nice', code_departement: '06', resales: 9200, median_gain_pct: 18 },
      ],
    };
  }
  const res = await fetch(`${API}/api/stats`);
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

export interface StatsExplore {
  byYear: StatsData['byYear'];
  byType: StatsData['byType'];
  byMonth: StatsData['byMonth'];
  priceBands: StatsData['priceBands'];
  byDept: StatsData['byDept'];
  totals: { ventes: number; volume: number };
}

/** Interactive stats recomputed for a year/region/dept/commune scope. */
export async function getStatsExplore(f: { year?: number; region?: string; dept?: string; commune?: string }): Promise<StatsExplore | null> {
  if (USING_MOCK) return null;
  const sp = new URLSearchParams();
  if (f.year) sp.set('year', String(f.year));
  if (f.commune) sp.set('commune', f.commune);
  else if (f.dept) sp.set('dept', f.dept);
  else if (f.region) sp.set('region', f.region);
  try {
    const res = await fetch(`${API}/api/stats/explore?${sp.toString()}`);
    if (!res.ok) return null;
    const d = await res.json();
    const num = (v: any) => (v == null ? null : Number(v));
    return {
      byYear: (d.byYear ?? []).map((r: any) => ({ annee: Number(r.annee), ventes: Number(r.ventes), volume: Number(r.volume), median_m2: num(r.median_m2) })),
      byType: (d.byType ?? []).map((r: any) => ({ type: r.type, ventes: Number(r.ventes), median_m2: num(r.median_m2) })),
      byMonth: (d.byMonth ?? []).map((r: any) => ({ mois: Number(r.mois), ventes: Number(r.ventes) })),
      priceBands: (d.priceBands ?? []).map((r: any) => ({ ord: Number(r.ord), label: r.label, ventes: Number(r.ventes) })),
      byDept: (d.byDept ?? []).map((r: any) => ({ dept: r.dept, ventes: Number(r.ventes), volume: 0, median_m2: num(r.median_m2) })),
      totals: { ventes: Number(d.totals?.ventes || 0), volume: Number(d.totals?.volume || 0) },
    };
  } catch {
    return null;
  }
}

/** Latest transaction date (to default the map to the last 6 months of data). */
export async function getMeta(): Promise<{ maxDate: string | null }> {
  if (USING_MOCK) return { maxDate: '2025-12-31' };
  try {
    const res = await fetch(`${API}/api/meta`);
    if (!res.ok) return { maxDate: null };
    return res.json();
  } catch {
    return { maxDate: null };
  }
}

/** Local news for a commune (headlines + links, lightly tagged). */
export async function getNews(code: string): Promise<NewsItem[]> {
  if (USING_MOCK) {
    return [
      { title: 'Une nouvelle ligne de tramway à l’étude', link: '#', date: '', source: 'Presse locale', tag: 'pos' },
      { title: 'Ouverture d’un pôle d’entreprises au printemps', link: '#', date: '', source: 'Presse locale', tag: 'pos' },
      { title: 'Travaux de rénovation du centre-ville', link: '#', date: '', source: 'Presse locale', tag: 'neutral' },
    ];
  }
  try {
    const res = await fetch(`${API}/api/news/${encodeURIComponent(code)}`);
    if (!res.ok) return [];
    const d = await res.json();
    return d.items ?? [];
  } catch {
    return [];
  }
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
