'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Source, Layer, Marker, Popup, NavigationControl, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { useRouter } from 'next/navigation';
import { getChoropleth, ChoroPoint } from '@/lib/api';

const STYLE: any = {
  version: 8,
  sources: { base: { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap, © CARTO' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
};

// Rough centroid (average of the largest ring) for placing a value label.
function centroid(geom: any): [number, number] | null {
  let ring: number[][] | null = null;
  if (geom?.type === 'Polygon') ring = geom.coordinates[0];
  else if (geom?.type === 'MultiPolygon') {
    ring = geom.coordinates.reduce((best: number[][] | null, poly: number[][][]) =>
      (!best || poly[0].length > best.length ? poly[0] : best), null);
  }
  if (!ring || !ring.length) return null;
  let lon = 0, lat = 0;
  for (const c of ring) { lon += c[0]; lat += c[1]; }
  return [lon / ring.length, lat / ring.length];
}

const GEO_URL = {
  dept: 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements.geojson',
  region: 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions.geojson',
};
const PALETTE = {
  price: ['#e0f2f1', '#80cbc4', '#26a69a', '#00897b', '#00695c'],
  rent: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#e65100'],
};

function quantiles(vals: number[], n: number): number[] {
  const a = [...vals].sort((x, y) => x - y);
  if (!a.length) return [];
  return Array.from({ length: n }, (_, i) => a[Math.min(a.length - 1, Math.floor((i / (n - 1)) * (a.length - 1)))]);
}

// Bucket a value into a palette colour using quantile breaks (computed in JS to
// avoid fragile MapLibre interpolate expressions with tied stops / null inputs).
function colorFor(v: number | null, breaks: number[], pal: string[]): string {
  if (v == null || !breaks.length) return '#e5e7eb';
  let idx = 0;
  for (const b of breaks) if (v >= b) idx++;
  return pal[Math.min(pal.length - 1, Math.max(0, idx - 1))];
}

export function ChoroplethMap({ level, metric, ptype, locale, unit }: {
  level: 'dept' | 'region'; metric: 'price' | 'rent'; ptype: 'maison' | 'appartement'; locale: string; unit: string;
}) {
  const router = useRouter();
  const geoCache = useRef<Record<string, any>>({});
  const [geo, setGeo] = useState<any | null>(null);
  const [values, setValues] = useState<ChoroPoint[]>([]);
  const [hovered, setHovered] = useState<{ lon: number; lat: number; name: string; value: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (geoCache.current[level]) { setGeo(geoCache.current[level]); }
    else {
      setGeo(null);
      fetch(GEO_URL[level]).then((r) => (r.ok ? r.json() : null)).then((g) => {
        if (cancelled || !g?.features) return;
        geoCache.current[level] = g; setGeo(g);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [level]);

  useEffect(() => {
    getChoropleth(level, metric, ptype).then(setValues).catch(() => setValues([]));
  }, [level, metric, ptype]);

  const fmtLabel = (v: number) => (metric === 'rent' ? v.toFixed(1).replace('.', ',') : v.toLocaleString('fr-FR'));

  const { data, breaks } = useMemo(() => {
    if (!geo) return { data: null as any, breaks: [] as number[] };
    const pal = PALETTE[metric];
    const map = new Map(values.map((v) => [v.code, v.value]));
    const bk = quantiles(values.map((v) => v.value), 5);
    const features = geo.features.map((f: any) => {
      const value = map.get(f.properties.code) ?? null;
      return { ...f, properties: { ...f.properties, value, label: value != null ? fmtLabel(value) : '', fillColor: colorFor(value, bk, pal) } };
    });
    return { data: { type: 'FeatureCollection', features }, breaks: bk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, values, metric]);

  // Value labels as HTML markers (no external glyph dependency).
  const labels = useMemo(() => {
    if (!data) return [] as { lon: number; lat: number; label: string }[];
    return data.features
      .filter((f: any) => f.properties.label)
      .map((f: any) => { const c = centroid(f.geometry); return c ? { lon: c[0], lat: c[1], label: f.properties.label } : null; })
      .filter(Boolean) as { lon: number; lat: number; label: string }[];
  }, [data]);

  const fmt = (v: number) => v.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB');

  const onMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (f) setHovered({ lon: e.lngLat.lng, lat: e.lngLat.lat, name: (f.properties as any).nom, value: (f.properties as any).value });
    else setHovered(null);
  };
  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (f && level === 'dept') router.push(`/screener?dept=${(f.properties as any).code}`);
  };

  return (
    <div className="relative h-full w-full">
      <MapGL
        initialViewState={{ longitude: 2.4, latitude: 46.7, zoom: 4.8 }}
        mapStyle={STYLE}
        interactiveLayerIds={data ? ['choro-fill'] : []}
        onMouseMove={onMove}
        onMouseLeave={() => setHovered(null)}
        onClick={onClick}
        cursor={hovered ? 'pointer' : 'grab'}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {data && (
          <Source id="choro" type="geojson" data={data}>
            <Layer id="choro-fill" type="fill" paint={{ 'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.8 }} />
            <Layer id="choro-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': 0.8 }} />
          </Source>
        )}
        {labels.map((l, i) => (
          <Marker key={i} longitude={l.lon} latitude={l.lat}>
            <span className="pointer-events-none rounded bg-white/70 px-1 text-[10px] font-semibold text-slate-800">{l.label}</span>
          </Marker>
        ))}
        {hovered && (
          <Popup longitude={hovered.lon} latitude={hovered.lat} anchor="bottom" offset={8} closeButton={false} closeOnClick={false}>
            <div className="px-1 py-0.5 text-xs">
              <div className="font-semibold text-slate-800">{hovered.name}</div>
              <div className="text-slate-500">{hovered.value != null ? `${fmt(hovered.value)} ${unit}` : '—'}</div>
            </div>
          </Popup>
        )}
        <Legend breaks={breaks} metric={metric} unit={unit} fmt={fmt} />
      </MapGL>
    </div>
  );
}

function Legend({ breaks, metric, unit, fmt }: { breaks: number[]; metric: 'price' | 'rent'; unit: string; fmt: (v: number) => string }) {
  if (breaks.length < 2) return null;
  const pal = PALETTE[metric];
  return (
    <div className="pointer-events-none absolute bottom-6 left-4 z-10 rounded-xl border border-slate-100 bg-white/95 px-3 py-2.5 text-[11px] shadow-panel backdrop-blur">
      <div className="mb-1.5 font-semibold text-slate-700">{unit}</div>
      <div className="flex items-center gap-0.5">
        {pal.map((c) => <span key={c} className="h-3 w-6" style={{ background: c }} />)}
      </div>
      <div className="mt-1 flex justify-between text-slate-500">
        <span>{fmt(breaks[0])}</span>
        <span>{fmt(breaks[breaks.length - 1])}</span>
      </div>
    </div>
  );
}
