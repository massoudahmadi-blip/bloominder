#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load Sit@del building permits (logements autorisés) → average dwellings
# authorised per year per commune, into commune_demo.permits_logements.
# Pass the CSV URL(s) from statistiques.developpement-durable.gouv.fr /
# data.gouv.fr; the parser auto-detects the commune-code / date / dwellings cols.
#
# Usage (from infra/, db up, internet):
#   ./load_sitadel.sh <csv_url> [csv_url ...]
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

[ "$#" -ge 1 ] || { echo "Usage: ./load_sitadel.sh <csv_url> [csv_url ...]"; exit 1; }

echo ">> Ensuring schema..."; psql < "$HERE/invest_schema.sql" >/dev/null

FILES=(); i=0
for url in "$@"; do
  i=$((i+1)); out="$DATA/sitadel_$i.csv"
  echo ">> Downloading Sit@del source $i ..."; curl -fSL "$url" -o "$out"; FILES+=("$out")
done

echo ">> Aggregating permits per commune..."
python3 "$HERE/raw/fetch_sitadel.py" --out "$DATA/sitadel_clean.csv" --infiles "${FILES[@]}"

echo ">> Loading into commune_demo.permits_logements..."
psql -c "DROP TABLE IF EXISTS stg_sitadel; CREATE TABLE stg_sitadel(code_commune text, permits_logements numeric, permits_year int);" >/dev/null
psql -c "\copy stg_sitadel FROM '/data/sitadel_clean.csv' CSV HEADER" >/dev/null
psql -c "INSERT INTO commune_demo(code_commune, permits_logements, permits_year)
  SELECT code_commune, permits_logements, permits_year FROM stg_sitadel WHERE code_commune<>''
  ON CONFLICT (code_commune) DO UPDATE SET permits_logements=EXCLUDED.permits_logements,
    permits_year=EXCLUDED.permits_year, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_sitadel;" >/dev/null

echo ">> Done:"
psql -c "SELECT count(*) FILTER (WHERE permits_logements IS NOT NULL) AS communes_with_permits, round(avg(permits_logements),1) AS avg_permits FROM commune_demo;"
