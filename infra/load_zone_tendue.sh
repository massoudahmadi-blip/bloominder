#!/usr/bin/env bash
# Load the national "zone tendue" commune list (DILA service-public reference).
# Usage (from infra/, db up, internet access): ./load_zone_tendue.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema (commune_zone_tendue)..."
psql < "$HERE/invest_schema.sql" >/dev/null

mkdir -p "$HERE/data"
OUT="$HERE/data/zone_tendue.csv"
echo ">> Fetching national zones tendues (service-public / DILA)..."
python3 "$HERE/raw/fetch_zone_tendue.py" --out "$OUT"

echo ">> Loading into Postgres..."
psql -c "TRUNCATE commune_zone_tendue;"
psql -c "\copy commune_zone_tendue(code_commune,zone_abc) FROM '/data/$(basename "$OUT")' CSV HEADER"

echo ">> Done:"
psql -c "SELECT count(*) AS communes_zone_tendue FROM commune_zone_tendue;"
