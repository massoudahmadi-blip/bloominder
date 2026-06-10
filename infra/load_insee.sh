#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load current population per commune (geo.api.gouv.fr) into commune_demo.
# Quick + light — safe to run any time. Re-run compute_metrics.sh afterwards
# so population feeds the demand score.
#
# Usage:  ./load_insee.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Fetching population from geo.api.gouv.fr..."
python3 "$HERE/raw/fetch_insee.py" "$DATA/insee_communes.csv"

echo ">> Loading into commune_demo..."
psql -c "DROP TABLE IF EXISTS stg_demo; CREATE TABLE stg_demo(code_commune text, code_departement text, population text);" >/dev/null
psql -c "\copy stg_demo FROM '/data/insee_communes.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_demo(code_commune,code_departement,population)
  SELECT code_commune, code_departement, NULLIF(population,'')::int
  FROM stg_demo WHERE code_commune <> ''
  ON CONFLICT (code_commune) DO UPDATE
    SET population = EXCLUDED.population,
        code_departement = COALESCE(commune_demo.code_departement, EXCLUDED.code_departement),
        updated_at = now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_demo;" >/dev/null

echo ">> Done. Communes with population:"
psql -c "SELECT count(*) AS communes, sum(population) AS pop_total FROM commune_demo WHERE population IS NOT NULL;"
