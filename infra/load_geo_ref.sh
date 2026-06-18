#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load reference geometry used by the geocoding pipeline:
#   - commune_centre : every commune's centre point  (commune-centroid fallback)
#   - dept_geom      : the 101 department polygons     (point-in-dept validation)
# Sources: geo.api.gouv.fr (communes) + france-geojson (departments). Idempotent.
#
# Usage (from infra/, db up, internet):  ./load_geo_ref.sh
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REF="$HERE/data/ref"; mkdir -p "$REF"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema..."; psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Commune centres (geo.api.gouv)..."
curl -fsSL "https://geo.api.gouv.fr/communes?fields=code,centre&geometry=centre&format=json" -o "$REF/communes.json"
python3 "$HERE/raw/geo_ref.py" communes --infile "$REF/communes.json" --out "$REF/commune_centre.csv"
psql -c "DROP TABLE IF EXISTS stg_cc; CREATE TABLE stg_cc(code_commune text, lon double precision, lat double precision);" >/dev/null
psql -c "\copy stg_cc FROM '/data/ref/commune_centre.csv' CSV HEADER" >/dev/null
psql -c "INSERT INTO commune_centre(code_commune,lon,lat,geom)
         SELECT code_commune,lon,lat,ST_SetSRID(ST_MakePoint(lon,lat),4326) FROM stg_cc
         ON CONFLICT (code_commune) DO UPDATE SET lon=EXCLUDED.lon,lat=EXCLUDED.lat,geom=EXCLUDED.geom;" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_cc;" >/dev/null

echo ">> Department polygons (france-geojson)..."
curl -fsSL "https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements.geojson" -o "$REF/departements.geojson"
python3 "$HERE/raw/geo_ref.py" depts --infile "$REF/departements.geojson" --out "$REF/dept_geom.csv"
psql -c "DROP TABLE IF EXISTS stg_dg; CREATE TABLE stg_dg(code_departement text, geom_json text);" >/dev/null
psql -c "\copy stg_dg FROM '/data/ref/dept_geom.csv' CSV HEADER" >/dev/null
psql -c "INSERT INTO dept_geom(code_departement,geom)
         SELECT code_departement, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(geom_json),4326)) FROM stg_dg
         ON CONFLICT (code_departement) DO UPDATE SET geom=EXCLUDED.geom;" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_dg;" >/dev/null

echo ">> Done:"
psql -c "SELECT (SELECT count(*) FROM commune_centre) AS commune_centres, (SELECT count(*) FROM dept_geom) AS dept_polygons;"
