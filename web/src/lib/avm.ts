// Comparables-based valuation (AVM).
// Robust central estimate: drop outliers (Tukey IQR fence), then take a
// weighted median of €/m² where weight blends proximity, recency and
// surface similarity to the subject property.

export type Reliability = 'high' | 'medium' | 'low';

export interface CompInput {
  prix_m2: number | null;
  date?: string;
  surface_bati?: number | null;
  longitude?: number;
  latitude?: number;
}

export interface AvmResult {
  value: number | null;   // estimated price = €/m² × surface
  low: number | null;     // weighted P25 × surface
  high: number | null;    // weighted P75 × surface
  medianM2: number | null;
  n: number;              // comparables in the sane band
  used: number;           // comparables kept after outlier trim
  reliability: Reliability;
}

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLon = (bLon - aLon) * toR;
  const la1 = aLat * toR, la2 = bLat * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function weightedQuantile(sorted: { v: number; w: number }[], q: number): number | null {
  if (!sorted.length) return null;
  const total = sorted.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length * q)]?.v ?? null;
  const target = q * total;
  let cum = 0;
  for (const x of sorted) { cum += x.w; if (cum >= target) return x.v; }
  return sorted[sorted.length - 1].v;
}

export function estimateValue(
  comps: CompInput[],
  surface: number,
  center?: { lat: number; lon: number },
): AvmResult {
  const band = comps.filter((c): c is CompInput & { prix_m2: number } =>
    c.prix_m2 != null && c.prix_m2 >= 300 && c.prix_m2 <= 30000);
  const n = band.length;
  if (n === 0) return { value: null, low: null, high: null, medianM2: null, n: 0, used: 0, reliability: 'low' };

  // Tukey fence on €/m² to drop garages / atypical lots.
  const vals = band.map((c) => c.prix_m2).sort((a, b) => a - b);
  const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const kept = band.filter((c) => c.prix_m2 >= lo && c.prix_m2 <= hi);

  const now = Date.now();
  const weighted = kept.map((c) => {
    let w = 1;
    if (center && c.longitude && c.latitude) {
      const d = haversine(center.lat, center.lon, c.latitude, c.longitude);
      w *= Math.exp(-((d / 600) ** 2)); // ~strong within 600 m
    }
    if (c.date) {
      const age = (now - new Date(c.date).getTime()) / (365.25 * 864e5);
      if (age > 0) w *= Math.pow(0.5, age / 4); // 4-year half-life
    }
    if (surface > 0 && c.surface_bati) {
      const rel = Math.abs(c.surface_bati - surface) / surface;
      w *= Math.exp(-((rel / 0.6) ** 2)); // similar size matters
    }
    return { v: c.prix_m2, w: w > 0 ? w : 1e-6 };
  }).sort((a, b) => a.v - b.v);

  const med = weightedQuantile(weighted, 0.5);
  const p25 = weightedQuantile(weighted, 0.25);
  const p75 = weightedQuantile(weighted, 0.75);
  const used = kept.length;
  return {
    value: med != null ? Math.round(med * surface) : null,
    low: p25 != null ? Math.round(p25 * surface) : null,
    high: p75 != null ? Math.round(p75 * surface) : null,
    medianM2: med != null ? Math.round(med) : null,
    n, used,
    reliability: used >= 15 ? 'high' : used >= 6 ? 'medium' : 'low',
  };
}
