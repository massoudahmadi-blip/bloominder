#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Load school IPS (indice de position sociale, Éducation Nationale) → mean per
# commune into commune_demo.ips_mean. Pass the CSV URLs (écoles, collèges,
# lycées) from data.education.gouv.fr / data.gouv.fr; the parser auto-detects
# the commune-code and IPS columns.
#
# Usage (from infra/, db up, internet):
#   ./load_ips.sh <csv_url> [csv_url ...]
#   e.g. ./load_ips.sh "https://.../fr-en-ips-ecoles.csv" "https://.../fr-en-ips-colleges.csv" "https://.../fr-en-ips-lycees.csv"
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; DATA="$HERE/data"; mkdir -p "$DATA"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
DB="${POSTGRES_DB:-bloominder}"; USR="${POSTGRES_USER:-bloominder}"
psql() { docker compose -f "$HERE/docker-compose.yml" exec -T db psql -v ON_ERROR_STOP=1 -U "$USR" -d "$DB" "$@"; }

[ "$#" -ge 1 ] || { echo "Usage: ./load_ips.sh <csv_url> [csv_url ...]"; exit 1; }

echo ">> Ensuring schema..."; psql < "$HERE/invest_schema.sql" >/dev/null

FILES=(); i=0
for url in "$@"; do
  i=$((i+1)); out="$DATA/ips_$i.csv"
  echo ">> Downloading IPS source $i ..."; curl -fSL "$url" -o "$out"; FILES+=("$out")
done

echo ">> Aggregating mean IPS per commune..."
python3 "$HERE/raw/fetch_ips.py" --out "$DATA/ips_clean.csv" --infiles "${FILES[@]}"

echo ">> Loading into commune_demo.ips_mean..."
psql -c "DROP TABLE IF EXISTS stg_ips; CREATE TABLE stg_ips(code_commune text, ips_mean numeric);" >/dev/null
psql -c "\copy stg_ips FROM '/data/ips_clean.csv' CSV HEADER" >/dev/null
psql -c "INSERT INTO commune_demo(code_commune, ips_mean)
  SELECT code_commune, ips_mean FROM stg_ips WHERE code_commune<>''
  ON CONFLICT (code_commune) DO UPDATE SET ips_mean=EXCLUDED.ips_mean, updated_at=now();" >/dev/null
psql -c "DROP TABLE IF EXISTS stg_ips;" >/dev/null

echo ">> Done:"
psql -c "SELECT count(*) FILTER (WHERE ips_mean IS NOT NULL) AS communes_with_ips, round(avg(ips_mean)) AS avg_ips FROM commune_demo;"
