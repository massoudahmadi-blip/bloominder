#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load INSEE recensement housing-structure + unemployment indicators into
# commune_demo. INSEE publishes these as year-coded ZIP/CSV "base communale"
# files whose download URLs change each release, so pass them as arguments.
#
# Find on insee.fr:
#   - "Logement" base communale  → base-cc-logement-YYYY.zip   (housing structure)
#   - "Population active / Emploi" base communale → base-cc-emploi-pop-active-YYYY.zip
#
# Usage:
#   ./load_insee_rp.sh <census_year_2digits> <logement_zip_url> [emploi_zip_url]
#   e.g. ./load_insee_rp.sh 21 "https://www.insee.fr/.../base-cc-logement-2021.zip" \
#                              "https://www.insee.fr/.../base-cc-emploi-pop-active-2021.zip"
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

YEAR="${1:?Usage: ./load_insee_rp.sh <census_year_2digits> <logement_zip_url> [emploi_zip_url]}"
LOG_URL="${2:-}"; EMP_URL="${3:-}"

echo ">> Ensuring schema..."; psql < "$HERE/invest_schema.sql" >/dev/null

load_one() {
  local url="$1" kind="$2"; [ -z "$url" ] && return 0
  echo ">> Downloading $kind ..."; curl -fSL "$url" -o "$DATA/insee_$kind.zip"
  rm -rf "$DATA/insee_$kind"; mkdir -p "$DATA/insee_$kind"
  unzip -o "$DATA/insee_$kind.zip" -d "$DATA/insee_$kind" >/dev/null
  local csv; csv="$(find "$DATA/insee_$kind" -iname '*.csv' | head -1)"
  [ -z "$csv" ] && { echo "   no CSV in zip"; return 1; }
  python3 "$HERE/raw/fetch_insee_rp.py" --infile "$csv" --out "$DATA/insee_${kind}_clean.csv" --year "$YEAR" --kind "$kind"
  if [ "$kind" = "logement" ]; then
    psql -c "DROP TABLE IF EXISTS stg_log; CREATE TABLE stg_log(code_commune text, owner_pct numeric, renter_pct numeric, vacancy_pct numeric, secondary_pct numeric);" >/dev/null
    psql -c "\copy stg_log FROM '/data/insee_logement_clean.csv' CSV HEADER" >/dev/null
    psql -c "INSERT INTO commune_demo(code_commune,owner_pct,renter_pct,vacancy_pct,secondary_pct)
      SELECT code_commune,owner_pct,renter_pct,vacancy_pct,secondary_pct FROM stg_log WHERE code_commune<>''
      ON CONFLICT (code_commune) DO UPDATE SET owner_pct=EXCLUDED.owner_pct, renter_pct=EXCLUDED.renter_pct,
        vacancy_pct=EXCLUDED.vacancy_pct, secondary_pct=EXCLUDED.secondary_pct, updated_at=now();" >/dev/null
    psql -c "DROP TABLE IF EXISTS stg_log;" >/dev/null
  else
    psql -c "DROP TABLE IF EXISTS stg_emp; CREATE TABLE stg_emp(code_commune text, unemployment_pct numeric);" >/dev/null
    psql -c "\copy stg_emp FROM '/data/insee_emploi_clean.csv' CSV HEADER" >/dev/null
    psql -c "INSERT INTO commune_demo(code_commune,unemployment_pct)
      SELECT code_commune,unemployment_pct FROM stg_emp WHERE code_commune<>''
      ON CONFLICT (code_commune) DO UPDATE SET unemployment_pct=EXCLUDED.unemployment_pct, updated_at=now();" >/dev/null
    psql -c "DROP TABLE IF EXISTS stg_emp;" >/dev/null
  fi
}

load_one "$LOG_URL" logement
load_one "$EMP_URL" emploi
echo ">> Done:"
psql -c "SELECT count(*) FILTER (WHERE owner_pct IS NOT NULL) AS housing, count(*) FILTER (WHERE unemployment_pct IS NOT NULL) AS jobs FROM commune_demo;"
