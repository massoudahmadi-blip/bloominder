#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load indicative rents per m² by commune (gouv "Carte des loyers", 2025).
# Independent of the DVF load — safe to run any time (even while it's running).
#
# Source dataset (data.gouv.fr): "Carte des loyers - indicateurs de loyers
# d'annonce par commune en 2025". Semicolon-delimited, decimal comma,
# columns include INSEE_C (commune) and loypredm2 (rent €/m²/month).
#
# Usage:  ./load_rents.sh
#
# When a newer year is published, find the new URLs via:
#   https://www.data.gouv.fr/api/1/datasets/?q=carte%20des%20loyers
# and update APP_URL / MAI_URL below.
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="$HERE/data"
mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"
USR="${POSTGRES_USER:-bloominder}"

BASE="https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025"
APP_URL="$BASE/20251211-145010/pred-app-mef-dhup.csv"
MAI_URL="$BASE/20251211-145039/pred-mai-mef-dhup.csv"

psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

echo ">> Ensuring investor schema..."
psql < "$HERE/invest_schema.sql" >/dev/null

psql -c "DROP TABLE IF EXISTS stg_rent;
CREATE TABLE stg_rent(id_zone text, insee text, libgeo text, epci text, dep text, reg text,
  loypredm2 text, lwr text, upr text, typpred text, nbobs_com text, nbobs_mail text, r2 text);" >/dev/null

load_rent() {
  local url="$1" col="$2" name="$3"
  echo ">> Loading $name ..."
  curl -fSL "$url" -o "$DATA/rent_$col.csv"
  psql -c "TRUNCATE stg_rent;" >/dev/null
  psql -c "\copy stg_rent FROM '/data/rent_$col.csv' WITH (FORMAT csv, DELIMITER ';', HEADER true, ENCODING 'LATIN1')" >/dev/null
  psql -c "INSERT INTO rents_commune(code_commune,nom_commune,code_departement,$col)
    SELECT insee, max(libgeo), max(dep), round(avg(replace(loypredm2,',','.')::numeric),2)
    FROM stg_rent WHERE insee <> '' AND loypredm2 <> ''
    GROUP BY insee
    ON CONFLICT (code_commune) DO UPDATE
      SET $col = EXCLUDED.$col,
          nom_commune = COALESCE(rents_commune.nom_commune, EXCLUDED.nom_commune),
          code_departement = COALESCE(rents_commune.code_departement, EXCLUDED.code_departement),
          updated_at = now();"
}

load_rent "$APP_URL" loyer_m2_appartement "apartment rents"
load_rent "$MAI_URL" loyer_m2_maison      "house rents"

psql -c "DROP TABLE IF EXISTS stg_rent;" >/dev/null
echo ">> Done. Communes with rent data:"
psql -c "SELECT count(*) AS communes, count(loyer_m2_appartement) AS with_appt, count(loyer_m2_maison) AS with_house FROM rents_commune;"
