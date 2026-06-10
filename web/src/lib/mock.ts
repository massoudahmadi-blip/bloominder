import type { Sale, PropertyType, BBox, Filters, YearTrend, CommuneRow, ScreenerSort, CommuneProfile } from './types';

// Deterministic pseudo-random so the demo looks the same every reload.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMUNES = [
  { nom: 'Arles', cp: '13200', code: '13004', lon: 4.6277, lat: 43.6766, base: 2600 },
  { nom: 'Saint-Rémy-de-Provence', cp: '13210', code: '13100', lon: 4.8316, lat: 43.7884, base: 4200 },
  { nom: 'Avignon', cp: '84000', code: '84007', lon: 4.8055, lat: 43.9493, base: 2900 },
  { nom: 'Les Baux-de-Provence', cp: '13520', code: '13011', lon: 4.795, lat: 43.744, base: 5200 },
  { nom: 'Maussane-les-Alpilles', cp: '13520', code: '13058', lon: 4.804, lat: 43.722, base: 4600 },
];

const STREETS = [
  'Rue de la République', 'Avenue Frédéric Mistral', 'Chemin des Oliviers',
  'Route de Tarascon', 'Impasse des Lavandes', 'Boulevard des Lices',
  'Rue du Mas Neuf', 'Allée des Platanes', 'Chemin de la Crau', 'Rue des Arènes',
];

const TYPES: PropertyType[] = ['Maison', 'Appartement', 'Terrain', 'Local'];

function makeSales(): Sale[] {
  const rnd = mulberry32(20240609);
  const sales: Sale[] = [];
  let id = 1;
  for (const c of COMMUNES) {
    const n = 35 + Math.floor(rnd() * 20);
    for (let i = 0; i < n; i++) {
      const type = TYPES[Math.floor(rnd() * (rnd() > 0.85 ? 4 : 2))]; // mostly houses/flats
      const lon = c.lon + (rnd() - 0.5) * 0.05;
      const lat = c.lat + (rnd() - 0.5) * 0.04;
      const year = 2019 + Math.floor(rnd() * 6);
      const month = 1 + Math.floor(rnd() * 12);
      const day = 1 + Math.floor(rnd() * 27);
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      let surface_bati: number | null = null;
      let nb_pieces: number | null = null;
      let surface_terrain: number | null = null;
      let prix_m2: number | null = null;
      let prix: number;

      if (type === 'Terrain') {
        surface_terrain = 200 + Math.floor(rnd() * 1500);
        prix = Math.round((80 + rnd() * 220) * surface_terrain);
      } else {
        surface_bati = type === 'Appartement' ? 30 + Math.floor(rnd() * 80) : 70 + Math.floor(rnd() * 180);
        nb_pieces = Math.max(1, Math.round(surface_bati / 25));
        const m2 = c.base * (0.7 + rnd() * 0.8);
        prix_m2 = Math.round(m2 / 50) * 50;
        prix = Math.round((prix_m2 * surface_bati) / 1000) * 1000;
        if (type === 'Maison') surface_terrain = 150 + Math.floor(rnd() * 1200);
      }

      const resalePct = rnd() > 0.7 ? Math.round(rnd() * 35 + 5) : null;
      const dpeClass = rnd() > 0.25 ? ['B', 'C', 'D', 'D', 'E', 'F', 'G'][Math.floor(rnd() * 7)] : null;
      sales.push({
        id: id++,
        id_mutation: `2024-${c.code}-${i}`,
        date,
        prix,
        type,
        prix_m2,
        adresse: `${1 + Math.floor(rnd() * 80)} ${STREETS[Math.floor(rnd() * STREETS.length)]}`,
        nom_commune: c.nom,
        code_postal: c.cp,
        code_commune: c.code,
        surface_bati,
        nb_pieces,
        surface_terrain,
        resale_pct: resalePct,
        resale_prev_date: resalePct != null ? `${year - 4}-06-15` : undefined,
        dpe: dpeClass,
        longitude: Number(lon.toFixed(6)),
        latitude: Number(lat.toFixed(6)),
      });
    }
  }
  return sales;
}

const ALL_SALES = makeSales();

function passesFilters(s: Sale, f: Filters): boolean {
  if (f.type !== 'all' && s.type !== f.type) return false;
  if (f.minPrice != null && s.prix < f.minPrice) return false;
  if (f.maxPrice != null && s.prix > f.maxPrice) return false;
  if (f.from && s.date < f.from) return false;
  if (f.to && s.date > f.to) return false;
  if (f.minSurface != null && (s.surface_bati ?? 0) < f.minSurface) return false;
  if (f.maxSurface != null && (s.surface_bati ?? Infinity) > f.maxSurface) return false;
  if (f.minLand != null && (s.surface_terrain ?? 0) < f.minLand) return false;
  if (f.maxLand != null && (s.surface_terrain ?? Infinity) > f.maxLand) return false;
  if (f.dpe && s.dpe !== f.dpe) return false;
  return true;
}

export function mockSalesInView(bbox: BBox, filters: Filters): Sale[] {
  return ALL_SALES.filter(
    (s) =>
      s.longitude >= bbox.minLon &&
      s.longitude <= bbox.maxLon &&
      s.latitude >= bbox.minLat &&
      s.latitude <= bbox.maxLat &&
      passesFilters(s, filters),
  );
}

export function mockComparables(lat: number, lon: number, type?: string | null): Sale[] {
  const dist = (s: Sale) => Math.hypot(s.longitude - lon, s.latitude - lat);
  return ALL_SALES.filter((s) => (type ? s.type === type : true))
    .sort((a, b) => dist(a) - dist(b))
    .slice(1, 7);
}

export function mockScreener(sort?: ScreenerSort, dir: 'asc' | 'desc' = 'desc'): CommuneRow[] {
  const rows: CommuneRow[] = COMMUNES.map((c, i) => {
    const med = c.base;
    const rent = Math.round(med * 0.0042 * 100) / 100;
    const yld = Math.round((rent * 12) / med * 1000) / 10;
    return {
      code_commune: c.code,
      nom_commune: c.nom,
      code_departement: c.code.slice(0, 2),
      ventes_total: 140 - i * 12,
      median_prix_m2: med,
      median_prix_m2_appartement: med,
      median_prix_m2_maison: Math.round(med * 0.95),
      prix_m2_growth_3y: 6 + i * 2.5,
      loyer_m2_appartement: rent,
      rendement_brut_appartement: yld,
      rendement_brut_maison: Math.round(yld * 0.9 * 10) / 10,
      score_global: 82 - i * 6,
      score_yield: 76 - i * 5,
      score_growth: 71 - i * 4,
      score_demand: 68 - i * 3,
      pct_passoire: 11 + i * 2,
      resale_gain: 22 - i * 3,
      taxe_fonciere: Math.round((28 + i * 3) * 10) / 10,
      airbnb_nightly: i < 3 ? 90 + i * 25 : null,
    };
  });
  const key = (sort ?? 'score_global') as keyof CommuneRow;
  rows.sort((a, b) => {
    const av = (a[key] as number) ?? -Infinity;
    const bv = (b[key] as number) ?? -Infinity;
    return dir === 'asc' ? av - bv : bv - av;
  });
  return rows;
}

export function mockCommuneTransactions(code: string, page = 1) {
  const all = ALL_SALES.filter((s) => s.code_commune === code);
  const pageSize = 20;
  const start = (page - 1) * pageSize;
  return { results: all.slice(start, start + pageSize), total: all.length, page, pageSize };
}

export function mockCommune(code: string): CommuneProfile | null {
  const c = COMMUNES.find((x) => x.code === code) ?? COMMUNES[0];
  const med = c.base;
  const rent = Math.round(med * 0.0042 * 100) / 100;
  const yld = Math.round((rent * 12) / med * 1000) / 10;
  return {
    metrics: {
      code_commune: c.code,
      nom_commune: c.nom,
      code_departement: c.code.slice(0, 2),
      ventes_total: 320,
      ventes_12m: 64,
      median_prix_m2: med,
      median_prix_m2_appartement: med,
      median_prix_m2_maison: Math.round(med * 0.95),
      prix_m2_growth_3y: 14,
      loyer_m2_appartement: rent,
      loyer_m2_maison: Math.round(rent * 0.85 * 100) / 100,
      rendement_brut_appartement: yld,
      rendement_brut_maison: Math.round(yld * 0.9 * 10) / 10,
      p25_prix_m2: Math.round(med * 0.8),
      p75_prix_m2: Math.round(med * 1.25),
      median_days_to_sell: 92,
    },
    scores: { score_yield: 72, score_growth: 64, score_demand: 70, score_global: 69 },
    dpe: { dpe_total: 4200, pct_passoire: 17.5, pct_abc: 28.3 },
    resale: { resales: 380, median_gain_pct: 16.5, median_annualized: 3.2 },
    demo: { population: 52000, pop_growth: null, median_income: null },
    tax: { taux_tfb: 34.2, taux_th: 18.5, thrs_major: null },
    airbnb: { listings: 640, median_nightly: 110, pct_entire: 72.5, median_occupancy: 48, median_revenue_year: 14800 },
    risk: { seismic_zone: 'Zone 2 (faible)', risks: 'Inondation · Mouvement de terrain · Séisme · Transport de matières dangereuses', icpe_count: 72, seveso_count: 2 },
    livability: { schools: 28, ecoles: 20, colleges: 5, lycees: 3, education_prioritaire: true },
    benchmark: { dept: Math.round(med * 0.92), fr: 3100 },
    valeur_verte: [
      { classe: 'B', ventes: 40, median_eur_m2: Math.round(med * 1.12) },
      { classe: 'C', ventes: 110, median_eur_m2: Math.round(med * 1.05) },
      { classe: 'D', ventes: 180, median_eur_m2: med },
      { classe: 'E', ventes: 130, median_eur_m2: Math.round(med * 0.94) },
      { classe: 'F', ventes: 70, median_eur_m2: Math.round(med * 0.88) },
      { classe: 'G', ventes: 35, median_eur_m2: Math.round(med * 0.82) },
    ],
  };
}

export function mockTrend(codeCommune?: string, type?: string | null): YearTrend[] {
  const pool = ALL_SALES.filter(
    (s) => (codeCommune ? s.code_commune === codeCommune : true) && (type ? s.type === type : true),
  );
  const byYear = new Map<number, number[]>();
  for (const s of pool) {
    if (s.prix_m2 == null) continue;
    const y = new Date(s.date).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s.prix_m2);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([annee, arr]) => {
      const sorted = arr.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? null;
      return { annee, ventes: arr.length, median_eur_m2: median };
    });
}
