#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load per-commune local tax rates (DGFiP "fiscalité locale des particuliers",
# REI) into commune_tax: taxe foncière (TFPB) + taxe d'habitation (THRS) rates.
# Light + quick. Re-run after to refresh.
#
# Usage:  ./load_taxes.sh
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

URL="https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/fiscalite-locale-des-particuliers-geo/exports/csv?select=insee_com,exercice,taux_global_tfb,taux_global_th,ind_majothrs&delimiter=%3B"

echo ">> Ensuring schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

echo ">> Downloading local tax rates (DGFiP)..."
curl -fSL "$URL" -o "$DATA/taxes.csv"

echo ">> Loading into commune_tax (latest year per commune)..."
psql -c "DROP TABLE IF EXISTS stg_tax;
CREATE TABLE stg_tax(insee_com text, exercice text, taux_tfb text, taux_th text, majothrs text);" >/dev/null
psql -c "\copy stg_tax FROM '/data/taxes.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true)" >/dev/null
psql -c "INSERT INTO commune_tax(code_commune,exercice,taux_tfb,taux_th,thrs_major)
  SELECT DISTINCT ON (insee_com) insee_com, exercice,
         NULLIF(replace(taux_tfb,',','.'),'')::numeric,
         NULLIF(replace(taux_th,',','.'),'')::numeric,
         NULLIF(majothrs,'')
  FROM stg_tax WHERE insee_com <> ''
  ORDER BY insee_com, exercice DESC
  ON CONFLICT (code_commune) DO UPDATE
    SET exercice=EXCLUDED.exercice, taux_tfb=EXCLUDED.taux_tfb, taux_th=EXCLUDED.taux_th,
        thrs_major=EXCLUDED.thrs_major, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_tax;" >/dev/null

echo ">> Done. Communes with tax rates (and average taxe foncière):"
psql -c "SELECT count(*) AS communes, round(avg(taux_tfb),1) AS avg_tfb_pct, round(avg(taux_th),1) AS avg_th_pct FROM commune_tax WHERE taux_tfb IS NOT NULL;"
