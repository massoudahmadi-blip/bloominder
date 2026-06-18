#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PARCEL-AUTHORITATIVE placement. The cadastral parcel (Code commune + Préfixe +
# Section + N° plan = id_parcelle) is the source of truth for a sale's location,
# not the address. For every commune that has sales whose parcel isn't yet
# confirmed, this:
#   1. downloads the Etalab cadastre parcels (polygons) for the commune,
#   2. places each sale at its parcel centroid when it has no point, AND
#   3. OVERRIDES any existing point that falls OUTSIDE its parcel polygon
#      (i.e. the address geocode contradicted the cadastre → trust the parcel),
#   4. keeps points that already sit inside the right parcel (more precise) and
#      marks them parcel-confirmed.
# Sets geo_precision='parcel'. Reports how many address points were overridden.
#
# Source: https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/<dep>/<insee>/cadastre-<insee>-parcelles.json.gz
#
# Usage (from infra/, internet; long-running — run under tmux):
#   ./backfill_geom.sh                 # every commune with not-yet-confirmed parcels
#   ./backfill_geom.sh 75111 13201     # only these communes
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data/cad"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Index on id_parcelle + parcel staging table..."
psql -c "CREATE INDEX IF NOT EXISTS transactions_parcelle_idx ON transactions (id_parcelle);" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_cad;
         CREATE TABLE stg_cad(id_parcelle text, lon double precision, lat double precision,
                              geom_json text, geom geometry);" >/dev/null

# Department directory for the cadastre path (metropole=2 digits, Corsica 2A/2B, DOM=3).
depdir() { local c="$1"; case "$c" in 97*|98*) echo "${c:0:3}";; 2A*|2B*) echo "${c:0:2}";; *) echo "${c:0:2}";; esac; }

if [ "$#" -gt 0 ]; then
  COMMUNES=("$@")
  echo ">> Targeted placement: ${#COMMUNES[@]} commune(s) — $*"
else
  mapfile -t COMMUNES < <(psql -tAc "SELECT DISTINCT code_commune FROM transactions
                                     WHERE id_parcelle IS NOT NULL AND geo_precision IS DISTINCT FROM 'parcel'
                                     ORDER BY 1")
  echo ">> ${#COMMUNES[@]} communes with not-yet-confirmed parcels."
fi

i=0; overridden_total=0
for insee in "${COMMUNES[@]}"; do
  [ -z "$insee" ] && continue
  i=$((i+1))
  dep="$(depdir "$insee")"
  url="https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/${dep}/${insee}/cadastre-${insee}-parcelles.json.gz"
  gz="$DATA/p.json.gz"; js="$DATA/p.json"; csv="$DATA/p.csv"
  if ! curl -fsSL "$url" -o "$gz"; then echo "   [$i/${#COMMUNES[@]}] $insee: no cadastre file, skip"; continue; fi
  gunzip -f "$gz" 2>/dev/null || { echo "   $insee: gunzip fail"; continue; }
  python3 "$HERE/raw/parcelle_centroids.py" --infile "$js" --out "$csv" 2>/dev/null || { echo "   $insee: parse fail"; continue; }

  psql -c "TRUNCATE stg_cad;" >/dev/null
  psql -c "\copy stg_cad(id_parcelle,lon,lat,geom_json) FROM '/data/cad/p.csv' CSV HEADER" >/dev/null
  psql -c "UPDATE stg_cad SET geom = ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(geom_json),4326)) WHERE geom_json <> '';
           CREATE INDEX ON stg_cad USING gist(geom); CREATE INDEX ON stg_cad(id_parcelle);" >/dev/null

  # How many existing points contradict the cadastre (outside their parcel)?
  ov=$(psql -tAc "SELECT count(*) FROM transactions t JOIN stg_cad s ON s.id_parcelle=t.id_parcelle
                  WHERE t.code_commune='${insee}' AND t.geom IS NOT NULL
                    AND s.geom IS NOT NULL AND NOT ST_Intersects(s.geom, t.geom);")
  overridden_total=$((overridden_total + ${ov:-0}))

  # Place unplaced + override contradictory points with the parcel centroid.
  psql -c "UPDATE transactions t SET longitude=s.lon, latitude=s.lat,
             geom=ST_SetSRID(ST_MakePoint(s.lon,s.lat),4326), geo_precision='parcel'
           FROM stg_cad s
           WHERE t.code_commune='${insee}' AND t.id_parcelle = s.id_parcelle
             AND (t.geom IS NULL OR (s.geom IS NOT NULL AND NOT ST_Intersects(s.geom, t.geom)));" >/dev/null
  # Confirm points that already sit inside the correct parcel (keep the precise point).
  psql -c "UPDATE transactions t SET geo_precision='parcel'
           FROM stg_cad s
           WHERE t.code_commune='${insee}' AND t.id_parcelle = s.id_parcelle
             AND t.geom IS NOT NULL AND s.geom IS NOT NULL AND ST_Intersects(s.geom, t.geom)
             AND t.geo_precision IS DISTINCT FROM 'parcel';" >/dev/null

  [ $((i % 50)) -eq 0 ] && echo "   …$i/${#COMMUNES[@]} communes (overrides so far: $overridden_total)"
done

psql -c "DROP TABLE IF EXISTS stg_cad;" >/dev/null
echo ">> Done. Address points overridden by parcel: $overridden_total"
psql -c "SELECT count(*) FILTER (WHERE geom IS NOT NULL) AS located,
                count(*) FILTER (WHERE geo_precision='parcel') AS parcel_confirmed,
                count(*) AS total FROM transactions;"
