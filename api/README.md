# Bloominder API

JSON API over the PostGIS DVF database. API-first so the website **and** the future mobile
app share one backend. Built with Fastify + TypeScript + node-postgres.

## Run locally
```bash
cd api
npm install
cp .env.example .env        # set DATABASE_URL to your PostGIS database
npm run dev                 # http://localhost:3001
```
> To develop against the VPS database from your PC, open an SSH tunnel first:
> `ssh -L 5432:localhost:5432 bloom@YOUR_SERVER_IP`  then use
> `DATABASE_URL=postgres://bloominder:PASSWORD@localhost:5432/bloominder`.

## Endpoints
| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness + DB connectivity |
| `GET /api/map?bbox=minLon,minLat,maxLon,maxLat&type=&from=&to=&limit=` | GeoJSON points in viewport (map) |
| `GET /api/search?q=&commune=&codeCommune=&type=&minPrice=&maxPrice=&from=&to=&page=&pageSize=` | Filtered, paginated results |
| `GET /api/property/:idMutation` | All lines of one sale |
| `GET /api/parcel/:idParcelle` | Sale history for a cadastral parcel |
| `GET /api/comparables?lat=&lon=&radius=&type=&limit=` | Nearby recent sales (comps / estimate) |
| `GET /api/stats/commune/:codeCommune` | Median €/m² by type + volume |
| `GET /api/stats/trend/:codeCommune?type=` | Median €/m² per year (trend chart) |

## Examples
```bash
curl "http://localhost:3001/health"
curl "http://localhost:3001/api/map?bbox=4.55,43.63,4.70,43.71&type=Maison&limit=500"
curl "http://localhost:3001/api/comparables?lat=43.6766&lon=4.6277&radius=500"
curl "http://localhost:3001/api/stats/trend/13004?type=Maison"
```

## Build for production
```bash
npm run build && npm start
```

## Notes
- All SQL is parameterized ($1, $2, …) to prevent injection.
- A DVF "mutation" can span several lines (multiple lots/parcels); `/property/:idMutation`
  returns them all, and aggregation for display happens per query.
