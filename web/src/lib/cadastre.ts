// Cadastral-parcel lookup via the IGN Géoplateforme WFS (public, no key).
// Returns GeoJSON in standard [lon, lat] order with a `contenance` (land area, m²).

export interface ParcelProps {
  idu?: string;
  section?: string;
  numero?: string;
  contenance?: number | string;
  nom_com?: string;
  code_insee?: string;
}
export interface ParcelFeature {
  type: 'Feature';
  geometry: any;
  properties: ParcelProps;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(lon, lat, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(lon, lat, rings[k])) return false; // holes
  return true;
}
export function pointInGeometry(lon: number, lat: number, geom: any): boolean {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInPolygon(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((p: number[][][]) => pointInPolygon(lon, lat, p));
  return false;
}

/** Find the cadastral parcel that contains the given point, or null. */
export async function fetchParcelAt(lon: number, lat: number): Promise<ParcelFeature | null> {
  const d = 0.0009; // ~90 m box (bbox is lat,lon for WFS 2.0 / EPSG:4326)
  const url =
    'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
    '&typeNames=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json' +
    `&srsName=EPSG:4326&count=40&bbox=${lat - d},${lon - d},${lat + d},${lon + d}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.features?.length) return null;
    return json.features.find((f: ParcelFeature) => pointInGeometry(lon, lat, f.geometry)) ?? null;
  } catch {
    return null;
  }
}
