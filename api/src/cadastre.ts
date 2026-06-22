import { gunzipSync } from 'zlib';

// Cadastre building footprints (Etalab) — fills the gap DVF leaves: a sale's
// dépendances/annexes have no surface in DVF, but the cadastre "bâtiments" layer
// has the real building polygons. We download the commune's parcels + buildings
// once (cached), assign each building to a parcel by centroid, and return the
// ground-floor footprint area (m²) per requested parcel.

const BASE = 'https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes';

type Ring = number[][];
interface CommuneCad { parcels: Map<string, Ring[]>; buildings: { c: [number, number]; area: number }[]; }

const cache = new Map<string, Promise<CommuneCad | null>>();

function depdir(insee: string): string {
  if (/^(97|98)/.test(insee)) return insee.slice(0, 3);
  return insee.slice(0, 2);
}

function rings(geom: any): Ring[] {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates[0]];
  if (geom.type === 'MultiPolygon') return geom.coordinates.map((p: any) => p[0]);
  return [];
}
function centroid(geom: any): [number, number] | null {
  const r = rings(geom);
  if (!r.length) return null;
  const pts = r[0];
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}
// Footprint area in m² (equirectangular shoelace — fine at parcel scale).
function areaM2(geom: any): number {
  let tot = 0;
  for (const ring of rings(geom)) {
    const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      s += ring[i][0] * 111320 * k * ring[i + 1][1] * 110540
         - ring[i + 1][0] * 111320 * k * ring[i][1] * 110540;
    }
    tot += Math.abs(s) / 2;
  }
  return tot;
}
function pointInRing(pt: [number, number], ring: Ring): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    if (((y1 > y) !== (y2 > y)) && (x < ((x2 - x1) * (y - y1)) / (y2 - y1 + 1e-12) + x1)) inside = !inside;
  }
  return inside;
}

async function fetchJsonGz(url: string): Promise<any | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return JSON.parse(gunzipSync(buf).toString('utf-8'));
}

async function loadCommune(insee: string): Promise<CommuneCad | null> {
  const dep = depdir(insee);
  const [par, bat] = await Promise.all([
    fetchJsonGz(`${BASE}/${dep}/${insee}/cadastre-${insee}-parcelles.json.gz`),
    fetchJsonGz(`${BASE}/${dep}/${insee}/cadastre-${insee}-batiments.json.gz`),
  ]);
  if (!par?.features) return null;
  const parcels = new Map<string, Ring[]>();
  for (const f of par.features) {
    const id = f.properties?.id;
    if (id) parcels.set(id, rings(f.geometry));
  }
  const buildings = (bat?.features ?? [])
    .map((f: any) => ({ c: centroid(f.geometry), area: areaM2(f.geometry) }))
    .filter((b: any) => b.c) as { c: [number, number]; area: number }[];
  return { parcels, buildings };
}

function getCommune(insee: string): Promise<CommuneCad | null> {
  let p = cache.get(insee);
  if (!p) {
    p = loadCommune(insee).catch(() => null);
    cache.set(insee, p);
    if (cache.size > 80) cache.delete(cache.keys().next().value as string); // simple LRU-ish cap
  }
  return p;
}

export interface ParcelBuildings { id_parcelle: string; footprints: number[]; built_total: number; }

export async function buildingsForParcels(insee: string, parcelIds: string[]): Promise<ParcelBuildings[]> {
  const cad = await getCommune(insee);
  if (!cad) return [];
  return parcelIds.map((id) => {
    const poly = cad.parcels.get(id);
    const fp: number[] = [];
    if (poly && poly[0]) {
      for (const b of cad.buildings) {
        if (pointInRing(b.c, poly[0]) && b.area >= 5) fp.push(Math.round(b.area));
      }
    }
    fp.sort((a, b) => b - a);
    return { id_parcelle: id, footprints: fp, built_total: fp.reduce((s, a) => s + a, 0) };
  });
}
