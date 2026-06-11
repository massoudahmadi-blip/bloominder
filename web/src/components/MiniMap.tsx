'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';

// Official IGN "Plan v2" base (roads, forests, rivers — French) under the cadastre.
const STYLE: any = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: ['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'],
      tileSize: 256,
      attribution: '© IGN — Géoplateforme',
    },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
};

// Small map centred on an address, with the IGN cadastre parcels overlaid and
// (optionally) the exact parcel outlined.
export function MiniMap({ lon, lat, height = 280, parcel }: {
  lon: number; lat: number; height?: number; parcel?: GeoJSON.Feature | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200" style={{ height }}>
      <Map
        key={`${lon},${lat}`}
        initialViewState={{ longitude: lon, latitude: lat, zoom: 16.5 }}
        mapStyle={STYLE}
        attributionControl={false}
        dragRotate={false}
      >
        <Source
          id="cad"
          type="raster"
          tiles={['https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}']}
          tileSize={256}
        >
          <Layer id="cadl" type="raster" paint={{ 'raster-opacity': 0.75 }} />
        </Source>
        {parcel && (
          <Source id="parcel" type="geojson" data={parcel}>
            <Layer id="parcel-fill" type="fill" paint={{ 'fill-color': '#0d9488', 'fill-opacity': 0.22 }} />
            <Layer id="parcel-line" type="line" paint={{ 'line-color': '#0d9488', 'line-width': 2.5 }} />
          </Source>
        )}
        <Marker longitude={lon} latitude={lat} anchor="bottom">
          <svg className="h-8 w-8 text-brand-600 drop-shadow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
        </Marker>
      </Map>
    </div>
  );
}
