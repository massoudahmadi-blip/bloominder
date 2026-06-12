#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load rent-control (encadrement des loyers) reference rents by quartier.
#
# Config-driven: each SOURCES entry is "CITY|BASE|DATASET|MAP" where MAP is a
# key in fetch_rent_control.py's MAPS (or inline JSON field mapping). Paris is
# verified. To add a city: confirm its Opendatasoft field names, add a MAPS
# entry in fetch_rent_control.py, then add a SOURCES line here.
#
# Usage (from infra/, db container up, internet access required):
#   ./load_rent_control.sh
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

SOURCES=(
  "PARIS|https://opendata.paris.fr|logement-encadrement-des-loyers|PARIS"
  # Add verified cities below, e.g.:
  # "LILLE|https://opendata.lillemetropole.fr|<dataset-slug>|LILLE"
  # "BORDEAUX|https://opendata.bordeaux-metropole.fr|<dataset-slug>|BORDEAUX"
)

echo ">> Resetting rent_control tables (schema changed)..."
psql -c "DROP TABLE IF EXISTS rent_control_ref, rent_control_zone CASCADE;" >/dev/null
echo ">> Ensuring schema (rent_control_*)..."
psql < "$HERE/invest_schema.sql" >/dev/null
mkdir -p "$HERE/data"

for src in "${SOURCES[@]}"; do
  IFS='|' read -r CITY BASE DATASET MAP <<< "$src"
  OUT="$HERE/data/rent_control_$(echo "$CITY" | tr '[:upper:]' '[:lower:]').sql"
  echo ">> Fetching $CITY ($BASE / $DATASET)..."
  python3 "$HERE/raw/fetch_rent_control.py" --out "$OUT" --base "$BASE" --dataset "$DATASET" --city "$CITY" --map "$MAP"
  echo ">> Loading $CITY into Postgres..."
  psql -f "/data/$(basename "$OUT")" >/dev/null
done

echo ">> Done."
psql -c "SELECT city, count(*) AS quartiers FROM rent_control_zone GROUP BY city;"
psql -c "SELECT city, count(DISTINCT zone_ref) AS secteurs, count(*) AS refs FROM rent_control_ref GROUP BY city;"
