#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load median standard of living (INSEE Filosofi) per commune into
# commune_demo.median_income. Quick + light.
#   ./load_income.sh
# Refresh the URL from data.gouv "Niveau de vie médian" when a new year ships.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

URL="https://static.data.gouv.fr/resources/niveau-de-vie-median/20260414-112033/mediane-niveau-vie-com.csv"

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading median income (Filosofi)..."
curl -fSL "$URL" -o "$DATA/income.csv"

echo ">> Loading into commune_demo.median_income..."
psql -c "DROP TABLE IF EXISTS stg_income;
CREATE TABLE stg_income(annee text, code_com text, nom_territoire text, valeur text);" >/dev/null
psql -c "\copy stg_income FROM '/data/income.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_demo(code_commune, median_income)
  SELECT code_com, NULLIF(valeur,'')::numeric FROM stg_income WHERE code_com <> ''
  ON CONFLICT (code_commune) DO UPDATE SET median_income = EXCLUDED.median_income, updated_at = now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_income;" >/dev/null

echo ">> Done. Communes with income:"
psql -c "SELECT count(*) AS communes, round(avg(median_income)) AS avg_income FROM commune_demo WHERE median_income IS NOT NULL;"
