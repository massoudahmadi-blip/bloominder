'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapGL, {
  Source,
  Layer,
  Marker,
  Popup,
  NavigationControl,
  type MapRef,
  type MapLayerMouseEvent,
} from 'react-map-gl/maplibre';
import type { GeoJSONSource } from 'maplibre-gl';
import { Sale, BBox } from '@/lib/types';
import { priceM2Color, formatEUR, formatPriceM2, formatM2, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { Legend } from './Legend';
import { EnergyBadge } from './EnergyBadge';

// Clean light basemap from CARTO (free, attribution required). No glyphs needed because
// we have no symbol layers — cluster counts are rendered as HTML markers.
const MAP_STYLE: any = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

const unclusteredLayer: any = {
  id: 'unclustered-point',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ['get', 'color'],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 8],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': '#ffffff',
    'circle-opacity': 0.95,
  },
};

const selectedLayer: any = {
  id: 'selected-point',
  type: 'circle',
  filter: ['==', ['get', 'sid'], ''],
  paint: {
    'circle-radius': 11,
    'circle-color': '#0d9488',
    'circle-stroke-width': 3,
    'circle-stroke-color': '#ffffff',
  },
};

const parcelFill: any = {
  id: 'parcel-fill',
  type: 'fill',
  paint: { 'fill-color': '#0d9488', 'fill-opacity': 0.18 },
};
const parcelLine: any = {
  id: 'parcel-line',
  type: 'line',
  paint: { 'line-color': '#0d9488', 'line-width': 2.5 },
};

interface ClusterMarker {
  id: number;
  count: number;
  lon: number;
  lat: number;
}

// --- Cadastre parcel lookup (IGN Géoplateforme WFS, GeoJSON lon/lat) ---
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
function pointInGeometry(lon: number, lat: number, geom: any): boolean {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointInPolygon(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((p: number[][][]) => pointInPolygon(lon, lat, p));
  return false;
}

export function PropertyMap({
  sales,
  selected,
  focus,
  onSelect,
  onViewChange,
}: {
  sales: Sale[];
  selected: Sale | null;
  focus: { lon: number; lat: number; key: number } | null;
  onSelect: (s: Sale | null) => void;
  onViewChange: (bbox: BBox) => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [clusters, setClusters] = useState<ClusterMarker[]>([]);
  const [cursor, setCursor] = useState<string>('grab');
  const [parcels, setParcels] = useState(false);
  const [hovered, setHovered] = useState<Sale | null>(null);
  const [parcel, setParcel] = useState<any | null>(null);
  const overCard = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, Sale>();
    for (const s of sales) m.set(String(s.id), s);
    return m;
  }, [sales]);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: sales.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.longitude, s.latitude] },
        properties: {
          sid: String(s.id),
          prix_m2: s.prix_m2,
          color: priceM2Color(s.prix_m2),
        },
      })),
    }),
    [sales],
  );

  const emitBounds = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    onViewChange({
      minLon: b.getWest(),
      minLat: b.getSouth(),
      maxLon: b.getEast(),
      maxLat: b.getNorth(),
    });
  }, [onViewChange]);

  const refreshClusters = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource('sales')) return;
    const feats = map.querySourceFeatures('sales', { filter: ['has', 'point_count'] } as any);
    const seen = new Set<number>();
    const out: ClusterMarker[] = [];
    for (const f of feats) {
      const id = (f.properties as any).cluster_id as number;
      if (seen.has(id)) continue;
      seen.add(id);
      const [lon, lat] = (f.geometry as any).coordinates;
      out.push({ id, count: (f.properties as any).point_count, lon, lat });
    }
    setClusters(out);
  }, []);

  const handleLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.on('idle', refreshClusters);
    emitBounds();
  }, [emitBounds, refreshClusters]);

  // Fly to a searched address and highlight the cadastral parcel under it.
  useEffect(() => {
    if (!focus) return;
    const map = mapRef.current?.getMap();
    map?.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 16.5), duration: 900 });

    let cancelled = false;
    const { lon, lat } = focus;
    const d = 0.0009; // ~90 m box around the point (bbox is lat,lon for WFS 2.0 / EPSG:4326)
    const url =
      'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
      '&typeNames=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle&outputFormat=application/json' +
      `&srsName=EPSG:4326&count=40&bbox=${lat - d},${lon - d},${lat + d},${lon + d}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.features?.length) return setParcel(null);
        const hit = json.features.find((f: any) => pointInGeometry(lon, lat, f.geometry)) ?? null;
        setParcel(hit);
        if (hit) setParcels(true); // reveal the cadastre tiles for context
      })
      .catch(() => !cancelled && setParcel(null));
    return () => { cancelled = true; };
  }, [focus]);

  const handleClick = (e: MapLayerMouseEvent) => {
    const feat = e.features?.[0];
    if (!feat) {
      onSelect(null);
      return;
    }
    if ((feat.properties as any).point_count) {
      const src = mapRef.current?.getMap().getSource('sales') as GeoJSONSource | undefined;
      const clusterId = (feat.properties as any).cluster_id;
      src?.getClusterExpansionZoom(clusterId).then((zoom) => {
        mapRef.current?.getMap().easeTo({
          center: (feat.geometry as any).coordinates,
          zoom,
          duration: 600,
        });
      });
      return;
    }
    const sid = (feat.properties as any).sid as string;
    const sale = byId.get(sid);
    if (sale) {
      onSelect(sale);
      setHovered(null);
    }
  };

  // Fluid hover: reveal the detail card on mouse-over (no click needed).
  // While the pointer is over the card itself we freeze it, so moving to the
  // "Analyser" button doesn't make the popup jump to a different dot.
  const handleMouseMove = (e: MapLayerMouseEvent) => {
    if (overCard.current) return;
    const feat = e.features?.[0];
    if (feat && !(feat.properties as any).point_count) {
      const sale = byId.get((feat.properties as any).sid as string);
      if (sale) {
        if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
        setCursor('pointer');
        if (sale.id !== hovered?.id) setHovered(sale);
        return;
      }
    }
    setCursor('grab');
  };

  // "Analyser cette adresse" → full address report (the estimation page, pre-seeded).
  const analyze = (s: Sale) => {
    const p = new URLSearchParams();
    p.set('lat', String(s.latitude));
    p.set('lon', String(s.longitude));
    if (s.code_commune) p.set('citycode', s.code_commune);
    const label = [s.adresse, s.nom_commune].filter(Boolean).join(', ');
    if (label) p.set('label', label);
    if (s.surface_bati) p.set('surface', String(Math.round(s.surface_bati)));
    if (s.type) p.set('type', s.type);
    router.push(`/estimation?${p.toString()}`);
  };

  const enterCard = () => {
    overCard.current = true;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const leaveCard = () => {
    overCard.current = false;
    closeTimer.current = setTimeout(() => setHovered(null), 180);
  };

  return (
    <div className="relative h-full w-full">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 4.7, latitude: 43.8, zoom: 9.5 }}
        mapStyle={MAP_STYLE}
        interactiveLayerIds={['unclustered-point']}
        cursor={cursor}
        onLoad={handleLoad}
        onMoveEnd={emitBounds}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setCursor('grab');
          if (!overCard.current) {
            if (closeTimer.current) clearTimeout(closeTimer.current);
            closeTimer.current = setTimeout(() => {
              if (!overCard.current) setHovered(null);
            }, 180);
          }
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {/* Official cadastre parcels overlay (IGN Géoplateforme), toggleable */}
        {parcels && (
          <Source
            id="cadastre"
            type="raster"
            tiles={['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}']}
            tileSize={256}
            attribution="© IGN — Parcellaire Express"
          >
            <Layer id="cadastre-lyr" type="raster" paint={{ 'raster-opacity': 0.7 }} beforeId="unclustered-point" />
          </Source>
        )}

        {/* Highlighted parcel under a searched address */}
        {parcel && (
          <Source id="parcel" type="geojson" data={parcel}>
            <Layer {...parcelFill} beforeId="unclustered-point" />
            <Layer {...parcelLine} beforeId="unclustered-point" />
          </Source>
        )}

        <Source id="sales" type="geojson" data={geojson} cluster clusterRadius={48} clusterMaxZoom={14}>
          <Layer {...unclusteredLayer} />
          <Layer {...selectedLayer} filter={['==', ['get', 'sid'], selected ? String(selected.id) : '']} />
        </Source>

        {clusters.map((c) => (
          <Marker key={c.id} longitude={c.lon} latitude={c.lat} anchor="center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const src = mapRef.current?.getMap().getSource('sales') as GeoJSONSource | undefined;
                src?.getClusterExpansionZoom(c.id).then((zoom) =>
                  mapRef.current?.getMap().easeTo({ center: [c.lon, c.lat], zoom, duration: 600 }),
                );
              }}
              className="grid place-items-center rounded-full border-2 border-white bg-brand-600/90 font-semibold text-white shadow-md transition hover:bg-brand-600"
              style={{
                width: 34 + Math.min(c.count, 200) / 8,
                height: 34 + Math.min(c.count, 200) / 8,
                fontSize: 12,
              }}
            >
              {c.count}
            </button>
          </Marker>
        ))}

        {hovered && (
          <Popup
            longitude={hovered.longitude}
            latitude={hovered.latitude}
            anchor="bottom"
            offset={16}
            closeButton={false}
            closeOnClick={false}
            onClose={() => setHovered(null)}
            maxWidth="300px"
            className="bloom-popup"
          >
            <div className="w-72 p-3.5" onMouseEnter={enterCard} onMouseLeave={leaveCard}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold uppercase tracking-tight text-slate-900">
                    {hovered.adresse || hovered.nom_commune}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {hovered.type && <span>{(t as any)[hovered.type] ?? hovered.type}</span>}
                    {hovered.dpe && <EnergyBadge classe={hovered.dpe} size={16} />}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-serif text-lg font-semibold leading-none text-slate-900">{formatEUR(hovered.prix, locale)}</div>
                  {hovered.prix_m2 != null && (
                    <div className="mt-0.5 text-xs font-medium text-brand-700">{formatPriceM2(hovered.prix_m2, locale)}</div>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
                <Metric label={t.surface} value={hovered.surface_bati != null ? formatM2(hovered.surface_bati) : '—'} />
                <Metric label={t.land} value={hovered.surface_terrain != null ? formatM2(hovered.surface_terrain) : '—'} />
                <Metric label={t.soldOn} value={hovered.date ? formatDate(hovered.date, locale) : '—'} />
              </div>

              {hovered.resale_pct != null && (
                <div className="mt-2 inline-block rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  {t.resold} {hovered.resale_pct > 0 ? '+' : ''}{hovered.resale_pct}%
                  {hovered.resale_prev_date ? ` · ${new Date(hovered.resale_prev_date).getFullYear()}` : ''}
                </div>
              )}

              <button
                onClick={() => { analyze(hovered); setHovered(null); }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 17l5-5 4 4 8-8M21 8h-4M21 8v4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t.analyzeAddress}
              </button>
            </div>
          </Popup>
        )}

        <Legend />
      </MapGL>
      <button
        onClick={() => setParcels((p) => !p)}
        className={`absolute left-3 top-16 z-10 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium shadow-panel transition ${parcels ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
        {t.parcels}
      </button>

      {/* Parcel info chip for a searched address */}
      {parcel && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-white/95 px-4 py-2 shadow-panel backdrop-blur">
          <svg className="h-4 w-4 shrink-0 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
          </svg>
          <div className="text-sm">
            <span className="font-semibold text-slate-900">
              {t.parcelLabel} {parcel.properties?.section ?? ''} {parcel.properties?.numero ?? ''}
            </span>
            {parcel.properties?.contenance != null && (
              <span className="ml-2 text-slate-500">· {t.land} {formatM2(Number(parcel.properties.contenance))}</span>
            )}
            {parcel.properties?.nom_com && (
              <span className="ml-2 text-slate-400">· {parcel.properties.nom_com}</span>
            )}
          </div>
          <button onClick={() => setParcel(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}
