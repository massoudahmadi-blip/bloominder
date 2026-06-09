import type { Sale, PropertyType, BBox, Filters, YearTrend } from './types';

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
