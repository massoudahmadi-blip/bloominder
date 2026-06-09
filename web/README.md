# Bloominder Web

The Bloominder frontend — a map-first search experience for French sold prices.
Next.js (App Router) + TypeScript + Tailwind + MapLibre GL.

## Features
- **Map-first split view** (results list + interactive map), like HAR / SeLoger.
- **Clustered price markers** colored by €/m², with a legend.
- **Real French address autocomplete** via the government **BAN** API (works without our backend).
- **Property detail panel** — sale info, an estimate from comparable sales, a €/m² trend chart, nearby comps.
- **Bilingual FR/EN** (toggle in the header, remembers your choice).
- **Responsive** — map/list tabs on mobile, side-by-side on desktop.
- **Runs on mock data** (sample Provence sales) until the API is connected.

## Run
```bash
cd web
npm install
cp .env.example .env.local     # leave NEXT_PUBLIC_API_URL empty to use mock data
npm run dev                    # http://localhost:3000
```
When the API is live, set `NEXT_PUBLIC_API_URL=https://api.bloominder.com` in `.env.local`
and the same UI switches to real data automatically.

## Structure
```
src/
├── app/            layout, global styles, the main page
├── components/     Header, SearchBar, Filters, PropertyMap, ResultsList, PropertyPanel, ...
└── lib/            api client, mock data, types, formatting, i18n
```

## Basemap & data attribution
- Basemap tiles: © OpenStreetMap, © CARTO (swap to IGN Géoplateforme for production).
- Address search: Base Adresse Nationale (BAN), data.gouv.fr.
- Sold prices: DVF (DGFiP / Etalab), Licence Ouverte.

## Notes
- Cluster counts are rendered as HTML markers (no map glyphs/fonts needed → no font-loading errors).
- The estimate is intentionally simple (comparable €/m² × surface) and clearly labelled as indicative.
