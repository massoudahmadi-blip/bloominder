#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load rent-control (encadrement des loyers) reference rents by quartier.
# Paris is implemented (opendata.paris.fr). Other cities publish their own
# datasets — add an adapter in fetch_rent_control.py and call it with
# --base/--dataset/--city, then re-run this loader.
#
# Usage (from infra/, db container up, internet access required):
#   ./load_rent_control.sh
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Resetting rent_control tables (schema changed)..."
psql -c "DROP TABLE IF EXISTS rent_control_ref, rent_control_zone CASCADE;" >/dev/null
echo ">> Ensuring schema (rent_control_*)..."
psql < "$HERE/invest_schema.sql" >/dev/null

mkdir -p "$HERE/data"
OUT="$HERE/data/rent_control_paris.sql"
echo ">> Fetching Paris encadrement des loyers (opendata.paris.fr)..."
python3 "$HERE/raw/fetch_rent_control.py" --out "$OUT"

echo ">> Loading into Postgres..."
psql -f "/data/$(basename "$OUT")" >/dev/null

echo ">> Done. Reference rows per city:"
psql -c "SELECT city, count(DISTINCT zone_id) AS zones, count(*) AS refs FROM rent_control_ref GROUP BY city;"
