'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Source, Layer, Marker, Popup, NavigationControl, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { useRouter } from 'next/navigation';
import { getChoropleth, ChoroPoint } from '@/lib/api';

const STYLE: any = {
  version: 8,
  sources: { base: { type: 'raster', tiles: ['https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png', 'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap, © CARTO' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
};
const GEO_URL = {
  region: 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/regions.geojson',
  dept: 'https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements.geojson',
};
const PALETTE = {
  price: ['#e0f2f1', '#80cbc4', '#26a69a', '#00897b', '#00695c'],
  rent: ['#fff3e0', '#ffcc80', '#ffa726', '#fb8c00', '#e65100'],
};
const REGION_DEPTS: Record<string, string[]> = {
  '84': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  '27': ['21', '25', '39', '58', '70', '71', '89', '90'],
  '53': ['22', '29', '35', '56'],
  '24': ['18', '28', '36', '37', '41', '45'],
  '94': ['2A', '2B'],
  '44': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  '32': ['02', '59', '60', '62', '80'],
  '11': ['75', '77', '78', '91', '92', '93', '94', '95'],
  '28': ['14', '27', '50', '61', '76'],
  '75': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  '76': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  '52': ['44', '49', '53', '72', '85'],
  '93': ['04', '05', '06', '13', '83', '84'],
  '01': ['971'], '02': ['972'], '03': ['973'], '04': ['974'], '06': ['976'],
};
// Departments whose single parent commune is split into arrondissements in DVF.
const ARR_PARENT: Record<string, string> = { '75': '75056', '69': '69123', '13': '13055' };

function quantiles(vals: number[], n: number): number[] {
  const a = [...vals].sort((x, y) => x - y);
  if (!a.length) return [];
  return Array.from({ length: n }, (_, i) => a[Math.min(a.length - 1, Math.floor((i / (n - 1)) * (a.length - 1)))]);
}
function colorFor(v: number | null, breaks: number[], pal: string[]): string {
  if (v == null || !breaks.length) return '#e5e7eb';
  let idx = 0;
  for (const b of breaks) if (v >= b) idx++;
  return pal[Math.min(pal.length - 1, Math.max(0, idx - 1))];
}
function centroid(geom: any): [number, number] | null {
  let ring: number[][] | null = null;
  if (geom?.type === 'Polygon') ring = geom.coordinates[0];
  else if (geom?.type === 'MultiPolygon') ring = geom.coordinates.reduce((best: number[][] | null, p: number[][][]) => (!best || p[0].length > best.length ? p[0] : best), null);
  if (!ring?.length) return null;
  let lon = 0, lat = 0;
  for (const c of ring) { lon += c[0]; lat += c[1]; }
  return [lon / ring.length, lat / ring.length];
}
function bbox(features: any[]): [[number, number], [number, number]] | null {
  let minX = 180, minY = 90, maxX = -180, maxY = -90, found = false;
  const scan = (coords: any) => {
    if (typeof coords[0] === 'number') {
      found = true;
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
    } else coords.forEach(scan);
  };
  features.forEach((f) => f.geometry && scan(f.geometry.coordinates));
  return found ? [[minX, minY], [maxX, maxY]] : null;
}

type Crumb = { code: string; nom: string };
type Drill = { level: 'region' | 'dept' | 'commune'; region?: Crumb; dept?: Crumb };

export function ChoroplethMap({ metric, ptype, locale, unit }: {
  metric: 'price' | 'rent'; ptype: 'maison' | 'appartement'; locale: string; unit: string;
}) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const cache = useRef<Record<string, any>>({});
  const [drill, setDrill] = useState<Drill>({ level: 'region' });
  const [regionGeo, setRegionGeo] = useState<any>(null);
  const [deptGeo, setDeptGeo] = useState<any>(null);
  const [communeGeo, setCommuneGeo] = useState<any>(null);
  const [values, setValues] = useState<ChoroPoint[]>([]);
  const [hovered, setHovered] = useState<{ lon: number; lat: number; name: string; value: number | null } | null>(null);

  // Static geometry (region + dept) once.
  useEffect(() => {
    (['region', 'dept'] as const).forEach((k) => {
      if (cache.current[k]) { k === 'region' ? setRegionGeo(cache.current[k]) : setDeptGeo(cache.current[k]); return; }
      fetch(GEO_URL[k]).then((r) => (r.ok ? r.json() : null)).then((g) => {
        if (!g?.features) return;
        cache.current[k] = g;
        k === 'region' ? setRegionGeo(g) : setDeptGeo(g);
      }).catch(() => {});
    });
  }, []);

  // Commune geometry for the drilled department (geo.api.gouv contours).
  // Paris/Lyon/Marseille are single communes (75056/69123/13055) but DVF is keyed
  // by arrondissement (75101…, 69381…, 13201…), so swap the parent city for its
  // arrondissements to show price per arrondissement.
  useEffect(() => {
    if (drill.level !== 'commune' || !drill.dept) return;
    const code = drill.dept.code;
    if (cache.current[`com-${code}`]) { setCommuneGeo(cache.current[`com-${code}`]); return; }
    setCommuneGeo(null);
    const parent = ARR_PARENT[code];
    const base = `https://geo.api.gouv.fr/departements/${code}/communes?geometry=contour&format=geojson&fields=nom,code`;
    const arrUrl = parent
      ? `https://geo.api.gouv.fr/communes?type=arrondissement-municipal&codeDepartement=${code}&geometry=contour&format=geojson&fields=nom,code`
      : null;
    Promise.all([
      fetch(base).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      arrUrl ? fetch(arrUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
    ]).then(([g, a]) => {
      if (!g?.features) return;
      let features = g.features;
      if (parent && a?.features?.length) {
        features = features.filter((f: any) => f.properties.code !== parent).concat(a.features);
      }
      const merged = { type: 'FeatureCollection', features };
      cache.current[`com-${code}`] = merged; setCommuneGeo(merged);
    }).catch(() => {});
  }, [drill]);

  useEffect(() => {
    getChoropleth(drill.level, metric, ptype, drill.dept?.code).then(setValues).catch(() => setValues([]));
  }, [drill, metric, ptype]);

  const fmtLabel = (v: number) => (metric === 'rent' ? v.toFixed(1).replace('.', ',') : v.toLocaleString('fr-FR'));
  const fmt = (v: number) => v.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB');

  const baseGeo = useMemo(() => {
    if (drill.level === 'region') return regionGeo;
    if (drill.level === 'commune') return communeGeo;
    if (!deptGeo || !drill.region) return null;
    const codes = new Set(REGION_DEPTS[drill.region.code] ?? []);
    return { type: 'FeatureCollection', features: deptGeo.features.filter((f: any) => codes.has(f.properties.code)) };
  }, [drill, regionGeo, deptGeo, communeGeo]);

  const { data, breaks } = useMemo(() => {
    if (!baseGeo) return { data: null as any, breaks: [] as number[] };
    const pal = PALETTE[metric];
    const map = new Map(values.map((v) => [v.code, v.value]));
    const bk = quantiles(values.map((v) => v.value), 5);
    const features = baseGeo.features.map((f: any) => {
      const value = map.get(f.properties.code) ?? null;
      return { ...f, properties: { ...f.properties, value, label: value != null ? fmtLabel(value) : '', fillColor: colorFor(value, bk, pal) } };
    });
    return { data: { type: 'FeatureCollection', features }, breaks: bk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseGeo, values, metric]);

  // Fit the view to the current selection.
  useEffect(() => {
    if (!data?.features?.length) return;
    const b = bbox(data.features);
    if (b) mapRef.current?.getMap()?.fitBounds(b, { padding: 24, duration: 600 });
  }, [data]);

  // Labels at region/dept always; at commune level only when few features
  // (e.g. the 20 Paris arrondissements) so dense departments stay readable.
  const labels = useMemo(() => {
    if (!data) return [] as { lon: number; lat: number; label: string }[];
    if (drill.level === 'commune' && data.features.length > 30) return [];
    return data.features.filter((f: any) => f.properties.label)
      .map((f: any) => { const c = centroid(f.geometry); return c ? { lon: c[0], lat: c[1], label: f.properties.label } : null; })
      .filter(Boolean) as { lon: number; lat: number; label: string }[];
  }, [data, drill.level]);

  const onMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (f) setHovered({ lon: e.lngLat.lng, lat: e.lngLat.lat, name: (f.properties as any).nom, value: (f.properties as any).value });
    else setHovered(null);
  };
  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]; if (!f) return;
    const p = f.properties as any;
    if (drill.level === 'region') setDrill({ level: 'dept', region: { code: p.code, nom: p.nom } });
    else if (drill.level === 'dept') setDrill({ level: 'commune', region: drill.region, dept: { code: p.code, nom: p.nom } });
    else router.push(`/commune/${p.code}`);
  };

  return (
    <div className="relative h-full w-full">
      {/* Breadcrumb */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs shadow-panel backdrop-blur">
        <button onClick={() => setDrill({ level: 'region' })} className={drill.level === 'region' ? 'font-semibold text-slate-900' : 'text-brand-700 hover:underline'}>France</button>
        {drill.region && <>
          <span className="text-slate-300">›</span>
          <button onClick={() => setDrill({ level: 'dept', region: drill.region })} className={drill.level === 'dept' ? 'font-semibold text-slate-900' : 'text-brand-700 hover:underline'}>{drill.region.nom}</button>
        </>}
        {drill.dept && <>
          <span className="text-slate-300">›</span>
          <span className="font-semibold text-slate-900">{drill.dept.nom}</span>
        </>}
      </div>

      <MapGL
        ref={mapRef}
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
            <Layer id="choro-line" type="line" paint={{ 'line-color': '#ffffff', 'line-width': drill.level === 'commune' ? 0.4 : 0.9 }} />
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
      <div className="flex items-center gap-0.5">{pal.map((c) => <span key={c} className="h-3 w-6" style={{ background: c }} />)}</div>
      <div className="mt-1 flex justify-between text-slate-500"><span>{fmt(breaks[0])}</span><span>{fmt(breaks[breaks.length - 1])}</span></div>
    </div>
  );
}
