#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Locate transactions that have no coordinates (address geocoding failed) by
# their cadastral parcel centroid (Etalab cadastre). Iterates only the communes
# that still have un-located sales, so it's a safe one-time backfill.
#
# Source: https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/<dep>/<insee>/cadastre-<insee>-parcelles.json.gz
#
# Usage (from infra/, internet access; long-running — consider tmux/nohup):
#   ./backfill_geom.sh                 # every commune that still has un-located sales
#   ./backfill_geom.sh 75111 13201     # only these communes (e.g. locate Paris 11e now)
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data/cad"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Index on id_parcelle + staging table..."
psql -c "CREATE INDEX IF NOT EXISTS transactions_parcelle_idx ON transactions (id_parcelle);" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_cad; CREATE TABLE stg_cad(id_parcelle text, lon double precision, lat double precision);" >/dev/null

# Department directory for the cadastre path (metropole=2 digits, Corsica 2A/2B, DOM=3).
depdir() { local c="$1"; case "$c" in 97*|98*) echo "${c:0:3}";; 2A*|2B*) echo "${c:0:2}";; *) echo "${c:0:2}";; esac; }

if [ "$#" -gt 0 ]; then
  COMMUNES=("$@")
  echo ">> Targeted backfill: ${#COMMUNES[@]} commune(s) — $*"
else
  mapfile -t COMMUNES < <(psql -tAc "SELECT DISTINCT code_commune FROM transactions WHERE geom IS NULL AND id_parcelle IS NOT NULL ORDER BY 1")
  echo ">> ${#COMMUNES[@]} communes with un-located sales."
fi

i=0
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
  psql -c "\copy stg_cad FROM '/data/cad/p.csv' CSV HEADER" >/dev/null
  psql -c "UPDATE transactions t SET longitude=s.lon, latitude=s.lat,
             geom=ST_SetSRID(ST_MakePoint(s.lon,s.lat),4326), geo_precision='parcel'
           FROM stg_cad s
           WHERE t.code_commune='${insee}' AND t.geom IS NULL AND t.id_parcelle = s.id_parcelle;" >/dev/null
  [ $((i % 50)) -eq 0 ] && echo "   …$i/${#COMMUNES[@]} communes processed"
done

psql -c "DROP TABLE IF EXISTS stg_cad;" >/dev/null
echo ">> Done. Located vs total:"
psql -c "SELECT count(*) FILTER (WHERE geom IS NOT NULL) AS located, count(*) AS total FROM transactions;"
