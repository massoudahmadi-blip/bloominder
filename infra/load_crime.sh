#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load per-commune crime rate (SSMSI communal base) into commune_livability.
#   ./load_crime.sh
# Sum of "taux pour mille" across indicators for the latest year. Small counts
# are suppressed by SSMSI, so rates for tiny communes can be understated.
# Refresh the URL from data.gouv (SSMSI bases statistiques) yearly.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

URL="https://static.data.gouv.fr/resources/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/20260326-124144/donnee-data.gouv-2025-geographie2025-produit-le2026-02-03.csv.gz"

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading SSMSI communal crime base (~38 MB)..."
curl -fSL "$URL" -o "$DATA/crime.csv.gz"

echo ">> Reducing to per-commune crime rate..."
python3 "$HERE/raw/fetch_crime.py" --gz "$DATA/crime.csv.gz" --out "$DATA/crime.csv"

echo ">> Loading into commune_livability.crime_rate..."
psql -c "DROP TABLE IF EXISTS stg_crime; CREATE TABLE stg_crime(code_commune text, crime_rate text);" >/dev/null
psql -c "\copy stg_crime FROM '/data/crime.csv' WITH (FORMAT csv, HEADER true)" >/dev/null
psql -c "INSERT INTO commune_livability(code_commune, crime_rate)
  SELECT code_commune, NULLIF(crime_rate,'')::numeric FROM stg_crime WHERE code_commune <> ''
  ON CONFLICT (code_commune) DO UPDATE SET crime_rate = EXCLUDED.crime_rate, updated_at = now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_crime;" >/dev/null

echo ">> Done. Communes with crime rate:"
psql -c "SELECT count(*) AS communes, round(avg(crime_rate),1) AS avg_rate FROM commune_livability WHERE crime_rate IS NOT NULL;"
