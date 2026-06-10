'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { priceM2Color, formatEUR, formatPriceM2, formatM2 } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { Legend } from './Legend';

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

interface ClusterMarker {
  id: number;
  count: number;
  lon: number;
  lat: number;
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
  const mapRef = useRef<MapRef>(null);
  const [clusters, setClusters] = useState<ClusterMarker[]>([]);
  const [cursor, setCursor] = useState<string>('grab');

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

  // Fly to a searched address.
  useEffect(() => {
    if (!focus) return;
    const map = mapRef.current?.getMap();
    map?.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 14.5), duration: 900 });
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
    if (sale) onSelect(sale);
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
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('grab')}
      >
        <NavigationControl position="top-right" showCompass={false} />

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

        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            offset={14}
            closeButton={false}
            onClose={() => onSelect(null)}
            maxWidth="260px"
          >
            <div className="w-56 p-3">
              <div className="text-lg font-semibold text-slate-900">{formatEUR(selected.prix, locale)}</div>
              {selected.prix_m2 != null && (
                <div className="text-xs font-medium text-brand-700">{formatPriceM2(selected.prix_m2, locale)}</div>
              )}
              <div className="mt-1 truncate text-xs text-slate-500">
                {selected.adresse ? `${selected.adresse}, ` : ''}
                {selected.nom_commune}
              </div>
              <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
                {selected.type && <span>{(t as any)[selected.type] ?? selected.type}</span>}
                {selected.surface_bati != null && <span>{formatM2(selected.surface_bati)}</span>}
                {selected.nb_pieces != null && <span>{selected.nb_pieces} p.</span>}
              </div>
              {selected.resale_pct != null && (
                <div className="mt-2 inline-block rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  {t.resold} {selected.resale_pct > 0 ? '+' : ''}{selected.resale_pct}%
                  {selected.resale_prev_date ? ` · ${new Date(selected.resale_prev_date).getFullYear()}` : ''}
                </div>
              )}
            </div>
          </Popup>
        )}

        <Legend />
      </MapGL>
    </div>
  );
}
